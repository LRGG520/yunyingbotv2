import type { PublicCollectionResult } from "@yunyingbot/shared";
import {
  insertEvidenceRecord,
  updateTaskStatuses
} from "@yunyingbot/application";
import type { AppDbClient } from "../../../packages/application/src/db/client.js";
import { recordCollectionRunPg } from "../../../packages/application/src/collection/record-collection-run-pg.js";

const WEBSITE_PAGE_LIMIT = 30;
const DOCS_PAGE_LIMIT = 50;
const MAX_RAW_HTML_LENGTH = 40000;
const MAX_CLEAN_TEXT_LENGTH = 16000;
const MAX_INTERNAL_LINKS = 80;

const stripTags = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).slice(0, 200) : null;
};

const extractSummary = (html: string): string => {
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (metaDescription) {
    return metaDescription[1].trim().slice(0, 500);
  }
  return stripTags(html).slice(0, 500);
};

const sanitizeUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeUrlForDedup = (value: string): string => {
  const url = new URL(value);
  url.hash = "";
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const search = url.searchParams.toString();
  return `${url.origin}${pathname}${search ? `?${search}` : ""}`;
};

const looksLikeHtmlPage = (url: URL): boolean => {
  const pathname = url.pathname.toLowerCase();
  if (!pathname || pathname === "/") {
    return true;
  }

  const blockedExtensions = [
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".zip",
    ".rar",
    ".7z",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".css",
    ".js",
    ".json",
    ".xml"
  ];

  return !blockedExtensions.some((extension) => pathname.endsWith(extension));
};

const extractInternalLinks = (html: string, baseUrl: string, maxLinks: number): string[] => {
  const base = new URL(baseUrl);
  const matches = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)];
  const links = new Set<string>();

  for (const match of matches) {
    const href = match[1]?.trim();
    if (!href) continue;

    try {
      const resolved = new URL(href, base);
      if (resolved.origin !== base.origin) continue;
      if (!looksLikeHtmlPage(resolved)) continue;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      resolved.hash = "";
      links.add(normalizeUrlForDedup(resolved.toString()));
      if (links.size >= maxLinks) break;
    } catch {
      continue;
    }
  }

  return Array.from(links);
};

interface DomainPageRecord {
  url: string;
  discoveredFrom: string | null;
  title: string | null;
  summary: string;
  cleanText: string;
  rawHtml: string;
  internalLinks: string[];
  contentLength: number;
  pageIndex: number;
}

const fetchDomainPages = async (
  entryUrl: string,
  pageLimit: number
): Promise<{
  pages: DomainPageRecord[];
  warnings: string[];
  failedUrls: string[];
}> => {
  const entry = sanitizeUrl(entryUrl);
  if (!entry) {
    return { pages: [], warnings: [`Invalid URL skipped: ${entryUrl}`], failedUrls: [entryUrl] };
  }

  const queue: Array<{ url: string; discoveredFrom: string | null }> = [{ url: entry, discoveredFrom: null }];
  const queued = new Set<string>([normalizeUrlForDedup(entry)]);
  const visited = new Set<string>();
  const warnings: string[] = [];
  const failedUrls: string[] = [];
  const pages: DomainPageRecord[] = [];

  while (queue.length > 0 && pages.length < pageLimit) {
    const current = queue.shift();
    if (!current) break;

    const normalizedCurrent = normalizeUrlForDedup(current.url);
    if (visited.has(normalizedCurrent)) continue;
    visited.add(normalizedCurrent);

    try {
      const response = await fetch(current.url, {
        headers: { "User-Agent": "yunyingbotv2/0.1 content-domain-collector" }
      });

      if (!response.ok) {
        failedUrls.push(current.url);
        warnings.push(`Fetch failed for ${current.url} with status ${response.status}`);
        continue;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.includes("text/html")) {
        failedUrls.push(current.url);
        warnings.push(`Skipped non-HTML page ${current.url} (${contentType || "unknown content type"})`);
        continue;
      }

      const html = await response.text();
      const title = extractTitle(html);
      const summary = extractSummary(html);
      const cleanText = stripTags(html).slice(0, MAX_CLEAN_TEXT_LENGTH);
      const internalLinks = extractInternalLinks(html, current.url, MAX_INTERNAL_LINKS);

      pages.push({
        url: current.url,
        discoveredFrom: current.discoveredFrom,
        title,
        summary,
        cleanText,
        rawHtml: html.slice(0, MAX_RAW_HTML_LENGTH),
        internalLinks,
        contentLength: cleanText.length,
        pageIndex: pages.length + 1
      });

      for (const discoveredUrl of internalLinks) {
        if (pages.length + queue.length >= pageLimit) break;
        const normalizedDiscovered = normalizeUrlForDedup(discoveredUrl);
        if (visited.has(normalizedDiscovered) || queued.has(normalizedDiscovered)) continue;
        queued.add(normalizedDiscovered);
        queue.push({ url: discoveredUrl, discoveredFrom: current.url });
      }
    } catch (error) {
      failedUrls.push(current.url);
      warnings.push(`Fetch error for ${current.url}: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }

  if (queue.length > 0) {
    warnings.push(`Page collection limit reached at ${pageLimit} pages for ${entry}`);
  }

  return { pages, warnings, failedUrls };
};

export const collectPublicDomain = async (db: AppDbClient, taskId: string): Promise<PublicCollectionResult> => {
  const sources = await db.query<{ id: string; source_url: string; source_type: string }>(
    `SELECT id, source_url, source_type
     FROM sources
     WHERE task_id = $1
       AND source_type IN ('website', 'docs', 'whitepaper')`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = new Date().toISOString();

  for (const source of sources) {
    if (source.source_type === "whitepaper" && source.source_url.endsWith(".pdf")) {
      skippedSources.push(source.source_url);
      warnings.push(`PDF whitepaper fetch metadata recorded but PDF parsing is not implemented yet: ${source.source_url}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
      continue;
    }

    const pageLimit = source.source_type === "website" ? WEBSITE_PAGE_LIMIT : DOCS_PAGE_LIMIT;
    const evidenceType = source.source_type === "website" ? "website_page" : "docs_page";

    try {
      const collectedDomain = await fetchDomainPages(source.source_url, pageLimit);

      await db.execute(
        `DELETE FROM evidences
         WHERE task_id = $1
           AND source_id = $2
           AND evidence_type = $3`,
        [taskId, source.id, evidenceType]
      );

      if (collectedDomain.pages.length === 0) {
        skippedSources.push(source.source_url);
        warnings.push(...collectedDomain.warnings);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
        continue;
      }

      for (const page of collectedDomain.pages) {
        await insertEvidenceRecord(db, {
          taskId,
          sourceId: source.id,
          evidenceType,
          title: page.title ? `${page.title}` : page.url,
          summary: `${page.summary}${page.url !== source.source_url ? ` [${page.url}]` : ""}`.slice(0, 500),
          rawContent: JSON.stringify({
            domainType: source.source_type,
            pageUrl: page.url,
            discoveredFrom: page.discoveredFrom,
            title: page.title,
            summary: page.summary,
            cleanText: page.cleanText,
            rawHtml: page.rawHtml,
            internalLinks: page.internalLinks,
            contentLength: page.contentLength,
            pageIndex: page.pageIndex,
            pageLimit
          }),
          credibilityLevel: "medium"
        });
      }

      await db.execute(
        `UPDATE sources
         SET access_status = $1, updated_at = $2
         WHERE id = $3`,
        [collectedDomain.failedUrls.length > 0 ? "partial" : "completed", now, source.id]
      );

      collectedSources.push(...collectedDomain.pages.map((page) => page.url));
      skippedSources.push(...collectedDomain.failedUrls);
      warnings.push(...collectedDomain.warnings);
      evidenceCount += collectedDomain.pages.length;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(`Fetch error for ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  await updateTaskStatuses(db, { taskId, collectionStatus: "evidence_ready" });

  await recordCollectionRunPg(db, {
    taskId,
    collectorKey: "public_web_fetch",
    sourceType: "website_docs",
    status: warnings.length > 0 ? "partial" : "completed",
    collectedCount: collectedSources.length,
    skippedCount: skippedSources.length,
    evidenceCount,
    warnings
  });

  return { taskId, collectedSources, skippedSources, warnings, evidenceCount };
};
