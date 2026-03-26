import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { insertEvidenceRecord, updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { recordCollectionRunPg } from "./record-collection-run-pg.js";

const MAX_WHITEPAPER_TEXT_LENGTH = 50000;
const MAX_SECTION_TEXT_LENGTH = 3500;
const MAX_SECTION_COUNT = 24;

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, " ")
    .trim();

const normalizeLine = (value: string): string =>
  value
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const looksLikeHeading = (line: string): boolean => {
  if (!line) {
    return false;
  }

  if (/^(table of contents|contents|overview|introduction|abstract|conclusion|appendix)\b/i.test(line)) {
    return true;
  }

  if (/^\d+(\.\d+){0,3}\s+[A-Za-z][A-Za-z0-9\s\-:/(),&]{2,120}$/.test(line)) {
    return true;
  }

  const words = line.split(/\s+/);
  if (
    words.length >= 2 &&
    words.length <= 10 &&
    line.length <= 90 &&
    !/[.!?]$/.test(line) &&
    /^[A-Z][A-Za-z0-9\s\-:/(),&]+$/.test(line)
  ) {
    return true;
  }

  return false;
};

type WhitepaperSection = {
  sectionIndex: number;
  heading: string;
  text: string;
};

const chunkText = (text: string, maxLength: number): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < maxLength * 0.5) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks.filter(Boolean);
};

const buildWhitepaperSections = (rawText: string): WhitepaperSection[] => {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const provisionalSections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      if (current && current.lines.length > 0) {
        provisionalSections.push(current);
      }
      current = { heading: line, lines: [] };
      continue;
    }

    if (!current) {
      current = { heading: "Opening Summary", lines: [] };
    }
    current.lines.push(line);
  }

  if (current && current.lines.length > 0) {
    provisionalSections.push(current);
  }

  const normalizedSections = provisionalSections
    .map((section) => ({
      heading: section.heading,
      text: normalizeText(section.lines.join(" "))
    }))
    .filter((section) => section.text.length > 120);

  const finalSections: WhitepaperSection[] = [];

  if (normalizedSections.length === 0) {
    return chunkText(normalizeText(rawText), MAX_SECTION_TEXT_LENGTH)
      .slice(0, MAX_SECTION_COUNT)
      .map((chunk, index) => ({
        sectionIndex: index + 1,
        heading: `Section ${index + 1}`,
        text: chunk
      }));
  }

  for (const section of normalizedSections) {
    const chunks = chunkText(section.text, MAX_SECTION_TEXT_LENGTH);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      if (finalSections.length >= MAX_SECTION_COUNT) {
        return finalSections;
      }
      finalSections.push({
        sectionIndex: finalSections.length + 1,
        heading: chunks.length === 1 ? section.heading : `${section.heading} (Part ${chunkIndex + 1})`,
        text: chunk
      });
    }
  }

  return finalSections;
};

export const collectWhitepaperPdfPg = async (db: AppDbClient, taskId: string): Promise<PublicCollectionResult> => {
  const sources = await db.query<{ id: string; source_url: string }>(
    `SELECT id, source_url
     FROM sources
     WHERE task_id = $1
       AND source_type = 'whitepaper'`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = new Date().toISOString();

  for (const source of sources) {
    const isLocalFile = source.source_url.startsWith("file://");
    if (!isLocalFile && !source.source_url.toLowerCase().endsWith(".pdf")) {
      skippedSources.push(source.source_url);
      warnings.push(`Whitepaper source is not a direct PDF URL and was skipped: ${source.source_url}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
      continue;
    }

    try {
      const pdfBuffer = isLocalFile
        ? await readFile(fileURLToPath(source.source_url))
        : await (async () => {
            const response = await fetch(source.source_url, {
              headers: { "User-Agent": "yunyingbotv2/0.1 whitepaper-pdf-collector" }
            });

            if (!response.ok) {
              skippedSources.push(source.source_url);
              warnings.push(`Whitepaper PDF fetch failed for ${source.source_url} with status ${response.status}`);
              await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
              return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
          })();

      if (!pdfBuffer) {
        continue;
      }

      const parser = new PDFParse({ data: pdfBuffer });
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();
      await parser.destroy();
      const rawText = textResult.text ?? "";
      const text = normalizeText(rawText);

      if (!text) {
        skippedSources.push(source.source_url);
        warnings.push(`Whitepaper PDF parsed but returned empty text: ${source.source_url}`);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
        continue;
      }

      const titleFromMeta = normalizeText(infoResult.info?.Title ?? "");
      const title = titleFromMeta || "Whitepaper PDF";
      const summary = text.slice(0, 500);
      const sections = buildWhitepaperSections(rawText);

      await db.execute(
        `DELETE FROM evidences
         WHERE task_id = $1
           AND source_id = $2
           AND evidence_type = 'whitepaper_page'`,
        [taskId, source.id]
      );

      const rawContent = JSON.stringify(
        {
          sourceUrl: source.source_url,
          pageCount: infoResult.total ?? null,
          info: infoResult.info ?? null,
          sectionCount: sections.length,
          sectionType: "full_document",
          text: text.slice(0, MAX_WHITEPAPER_TEXT_LENGTH)
        },
        null,
        2
      );

      await insertEvidenceRecord(db, {
        taskId,
        sourceId: source.id,
        evidenceType: "whitepaper_page",
        title,
        summary,
        rawContent,
        credibilityLevel: "medium"
      });

      evidenceCount += 1;

      for (const section of sections) {
        await insertEvidenceRecord(db, {
          taskId,
          sourceId: source.id,
          evidenceType: "whitepaper_page",
          title: `${title} - ${section.heading}`.slice(0, 200),
          summary: section.text.slice(0, 500),
          rawContent: JSON.stringify(
            {
              sourceUrl: source.source_url,
              pageCount: infoResult.total ?? null,
              info: infoResult.info ?? null,
              sectionType: "section",
              sectionIndex: section.sectionIndex,
              heading: section.heading,
              text: section.text
            },
            null,
            2
          ),
          credibilityLevel: "medium"
        });
        evidenceCount += 1;
      }

      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
      collectedSources.push(source.source_url);
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(
        `Whitepaper PDF parse failed for ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`
      );
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  if (evidenceCount > 0) {
    await updateTaskStatuses(db, {
      taskId,
      collectionStatus: "evidence_ready"
    });
  }

  await recordCollectionRunPg(db, {
    taskId,
    collectorKey: "whitepaper_pdf_parse",
    sourceType: "whitepaper",
    status: evidenceCount > 0 && skippedSources.length === 0 ? "completed" : evidenceCount > 0 ? "partial" : "failed",
    collectedCount: collectedSources.length,
    skippedCount: skippedSources.length,
    evidenceCount,
    warnings
  });

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};
