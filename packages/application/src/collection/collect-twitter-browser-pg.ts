import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { loadRepoEnv } from "../config/load-env.js";
import { insertEvidenceRecord, updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { resolveBrowserExecutablePath } from "./browser-runtime.js";
import { resolveTwitterBrowserUserDataDir } from "./twitter-browser-profile.js";
import { recordCollectionRunPg } from "./record-collection-run-pg.js";
import { resolveTwitterStorageStatePath } from "./twitter-storage-state.js";
import { chromium } from "playwright-core";

const TWITTER_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const TWITTER_BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--lang=en-US"
];

const LOGIN_WALL_MARKERS = ["don’t miss what’s happening", "don't miss what's happening", "log in", "sign up", "join x today", "sign in to x"];
const normalizeTwitterUrl = (value: string): string => value.replace(/^https:\/\/x\.com/i, "https://twitter.com");
const extractTweetId = (value: string): string | null => value.match(/\/status\/(\d+)/i)?.[1] ?? null;
const clampInt = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clampScore = (value: number): number => Math.max(1, Math.min(10, Number(value.toFixed(1))));
const nowIso = () => new Date().toISOString();

type TwitterPageStatus = "valid_tweet" | "weak_capture" | "blocked_wall" | "profile_or_unknown";
interface ExtractedArticle {
  index: number;
  text: string;
  handles: string[];
  statusIds: string[];
  datetime: string | null;
  metrics: { replies: number | null; reposts: number | null; likes: number | null; bookmarks: number | null; views: number | null };
}
interface TwitterPageExtraction {
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  bodyPreview: string;
  pageStatus: TwitterPageStatus;
  statusReason: string;
  mainTweet: ExtractedArticle | null;
  replies: ExtractedArticle[];
  tweetQualityScore: number;
  commentQualityScore: number;
}

const computeTweetQualityScore = (pageStatus: TwitterPageStatus, mainTweet: ExtractedArticle | null, title: string | null): number => {
  if (pageStatus === "blocked_wall") return 1;
  if (!mainTweet) return 2;
  let score = 3;
  score += Math.min(3.5, mainTweet.text.length / 180);
  score += mainTweet.datetime ? 1 : 0;
  score += mainTweet.handles.length > 0 ? 0.8 : 0;
  score += title && title !== "X" ? 0.7 : 0;
  score += mainTweet.metrics.views && mainTweet.metrics.views > 0 ? 0.5 : 0;
  return clampScore(score);
};

const computeCommentQualityScore = (pageStatus: TwitterPageStatus, replies: ExtractedArticle[]): number => {
  if (pageStatus === "blocked_wall") return 1;
  if (replies.length === 0) return 2.5;
  const averageLength = replies.reduce((sum, reply) => sum + reply.text.length, 0) / replies.length;
  const uniqueReplyCount = new Set(replies.map((reply) => reply.text)).size;
  let score = 2.5;
  score += Math.min(2.5, replies.length * 0.5);
  score += Math.min(3, averageLength / 80);
  score += (uniqueReplyCount / replies.length) * 2;
  return clampScore(score);
};

const captureTwitterPage = async (
  executablePath: string,
  userDataDir: string,
  storageStatePath: string,
  sourceUrl: string,
  targetTweetId: string | null,
  targetReplyCount: number,
  maxScrollSteps: number
): Promise<TwitterPageExtraction> => {
  mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: true,
    args: TWITTER_BROWSER_ARGS,
    userAgent: TWITTER_BROWSER_USER_AGENT,
    locale: "en-US",
    viewport: { width: 1440, height: 1200 }
  });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(normalizeTwitterUrl(sourceUrl), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2800);

    const extractOnce = async (): Promise<Omit<TwitterPageExtraction, "tweetQualityScore" | "commentQualityScore">> =>
      (await page.evaluate(`
      (() => {
        const tweetId = ${JSON.stringify(targetTweetId)};
        function normalizeText(value) {
          return (value || "").replace(/\\s+/g, " ").replace(/\\u00a0/g, " ").trim();
        }
        function extractStatusId(href) {
          const match = href.match(/\\/status\\/(\\d+)/i);
          return match ? match[1] : null;
        }
        function extractHandle(href) {
          try {
            const url = new URL(href, window.location.origin);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length >= 2 && parts[1] === "status") {
              return parts[0] || null;
            }
            return null;
          } catch {
            return null;
          }
        }
        function parseMetricValue(rawValue) {
          const normalized = normalizeText(rawValue).toLowerCase().replace(/,/g, "");
          if (!normalized) {
            return null;
          }
          const match = normalized.match(/([0-9]+(?:\\.[0-9]+)?)([kmb]|万|亿)?/i);
          if (!match) {
            return null;
          }
          const base = Number(match[1]);
          if (!Number.isFinite(base)) {
            return null;
          }
          const unit = match[2] || "";
          if (unit === "k") return Math.round(base * 1_000);
          if (unit === "m") return Math.round(base * 1_000_000);
          if (unit === "b") return Math.round(base * 1_000_000_000);
          if (unit === "万") return Math.round(base * 10_000);
          if (unit === "亿") return Math.round(base * 100_000_000);
          return Math.round(base);
        }
        function readMetricFromTestId(article, testId) {
          const node = article.querySelector('[data-testid="' + testId + '"]');
          if (!node) {
            return null;
          }
          const value = parseMetricValue(node.innerText || node.textContent || "");
          if (value !== null) {
            return value;
          }
          const parentValue = parseMetricValue(node.parentElement && (node.parentElement.innerText || node.parentElement.textContent));
          return parentValue;
        }
        function readViewsMetric(article, articleText, bodyTextValue) {
          const viewNode = article.querySelector('a[href*="/analytics"]');
          const directValue = parseMetricValue(viewNode && (viewNode.innerText || viewNode.textContent || ""));
          if (directValue !== null) {
            return directValue;
          }
          const match = (articleText + " " + bodyTextValue).match(/([0-9]+(?:\\.[0-9]+)?(?:[kmb]|万|亿)?)\\s*(views|查看)/i);
          if (!match) {
            return null;
          }
          return parseMetricValue(match[1]);
        }

        const bodyText = normalizeText(document.body && document.body.innerText);
        const title = normalizeText(document.title) || null;
        const metaDescription = normalizeText(document.querySelector('meta[name="description"]')?.getAttribute("content")) || null;
        const articles = Array.from(document.querySelectorAll("article"))
          .map((article, index) => {
            const text = normalizeText(article.innerText);
            const hrefs = Array.from(article.querySelectorAll("a[href]"))
              .map((anchor) => anchor.getAttribute("href") || "")
              .map((href) => {
                try {
                  return new URL(href, window.location.origin).href;
                } catch {
                  return href;
                }
              });

            const statusIds = Array.from(new Set(hrefs.map((href) => extractStatusId(href)).filter(Boolean)));
            const handles = Array.from(new Set(hrefs.map((href) => extractHandle(href)).filter(Boolean)));
            const datetime = article.querySelector("time")?.getAttribute("datetime") || null;
            const metrics = {
              replies: readMetricFromTestId(article, "reply"),
              reposts: readMetricFromTestId(article, "retweet"),
              likes: readMetricFromTestId(article, "like"),
              bookmarks: readMetricFromTestId(article, "bookmark"),
              views: readViewsMetric(article, text, bodyText)
            };

            return { index, text, handles, statusIds, datetime, metrics };
          })
          .filter((article) => article.text.length > 0);

        const loginWall = ${JSON.stringify(LOGIN_WALL_MARKERS)}.some((marker) => bodyText.toLowerCase().includes(marker));
        const hasTweetTitleMetadata = !!title && title !== "X" && title.includes(" on X:");
        const matchingArticle = tweetId ? articles.find((article) => article.statusIds.includes(tweetId)) : null;
        const mainTweet = matchingArticle || articles[0] || null;
        const replies = articles.filter((article) => article !== mainTweet);

        let pageStatus = "profile_or_unknown";
        let statusReason = "Page did not clearly match a tweet detail layout.";

        if (loginWall && hasTweetTitleMetadata) {
          pageStatus = "weak_capture";
          statusReason = "The tweet body is behind a login wall, but the page title still exposes tweet metadata.";
        } else if (loginWall) {
          pageStatus = "blocked_wall";
          statusReason = "Page content matches a login wall or restricted-view prompt.";
        } else if (mainTweet && mainTweet.text.length >= 40) {
          pageStatus = "valid_tweet";
          statusReason = "A tweet-like article with meaningful visible text was extracted.";
        } else if (mainTweet) {
          pageStatus = "weak_capture";
          statusReason = "The page loaded, but the extracted tweet text is too short or too generic.";
        }

        return {
          finalUrl: window.location.href,
          title,
          metaDescription,
          bodyPreview: bodyText.slice(0, 1200),
          pageStatus,
          statusReason,
          mainTweet,
          replies
        };
      })()
    `)) as Omit<TwitterPageExtraction, "tweetQualityScore" | "commentQualityScore">;

    const replyMap = new Map<string, ExtractedArticle>();
    let bestExtraction: Omit<TwitterPageExtraction, "tweetQualityScore" | "commentQualityScore"> | null = null;
    for (let step = 0; step < maxScrollSteps; step += 1) {
      const extraction = await extractOnce();
      if (!bestExtraction) {
        bestExtraction = extraction;
      }

      const priorities: Record<TwitterPageStatus, number> = {
        blocked_wall: 0,
        profile_or_unknown: 1,
        weak_capture: 2,
        valid_tweet: 3
      };
      if (bestExtraction && priorities[extraction.pageStatus] > priorities[bestExtraction.pageStatus]) {
        bestExtraction = extraction;
      }

      for (const reply of extraction.replies) {
        const key =
          (reply.statusIds[0] && `status:${reply.statusIds[0]}`) ||
          `${reply.datetime ?? "no_time"}:${reply.text.slice(0, 120)}`;
        if (!replyMap.has(key)) {
          replyMap.set(key, reply);
        }
      }

      if (extraction.pageStatus === "blocked_wall" || replyMap.size >= targetReplyCount) break;

      await page.evaluate(() => {
        window.scrollBy({ top: 1500, behavior: "instant" });
      });
      await page.waitForTimeout(1200);
    }
    const base = bestExtraction ?? (await extractOnce());
    const replies = [...replyMap.values()].slice(0, targetReplyCount);
    mkdirSync(path.dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
    await context.close();
    return {
      ...base,
      replies,
      tweetQualityScore: computeTweetQualityScore(base.pageStatus, base.mainTweet, base.title),
      commentQualityScore: computeCommentQualityScore(base.pageStatus, replies)
    };
  } finally {
    await context.close();
  }
};

const buildTweetSummary = (capture: TwitterPageExtraction): string =>
  capture.pageStatus === "blocked_wall"
    ? capture.statusReason
    : capture.mainTweet?.text
      ? capture.mainTweet.text.slice(0, 500)
      : (capture.metaDescription ?? capture.bodyPreview ?? "No visible tweet text extracted.").slice(0, 500);

export const collectTwitterBrowserPg = async (db: AppDbClient, repoRoot: string, taskId: string): Promise<PublicCollectionResult> => {
  const env = loadRepoEnv(repoRoot);
  const browserExecutablePath = resolveBrowserExecutablePath(repoRoot);
  const userDataDir = resolveTwitterBrowserUserDataDir(repoRoot);
  const storageStatePath = resolveTwitterStorageStatePath(repoRoot);
  const targetReplyCount = clampInt(Number(env.TWITTER_REPLY_TARGET ?? 50) || 50, 1, 100);
  const maxScrollSteps = clampInt(Number(env.TWITTER_BROWSER_MAX_SCROLL_STEPS ?? 18) || 18, 1, 60);
  const sources = await db.query<{ id: string; source_url: string }>(
    `SELECT id, source_url FROM sources WHERE task_id = $1 AND source_type = 'twitter'`,
    [taskId]
  );
  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();
  let sawPartial = false;

  if (!browserExecutablePath) {
    warnings.push("No supported browser executable is available for Twitter browser collection.");
    await recordCollectionRunPg(db, {
      taskId,
      collectorKey: "twitter_browser_fetch",
      sourceType: "twitter",
      status: "failed",
      collectedCount: 0,
      skippedCount: sources.length,
      evidenceCount: 0,
      warnings
    });
    return { taskId, collectedSources, skippedSources: sources.map((source) => source.source_url), warnings, evidenceCount };
  }
  if (!existsSync(storageStatePath)) {
    warnings.push(`Twitter storage state file not found at ${storageStatePath}; browser collection will run as logged-out session until this file is created.`);
  }

  for (const source of sources) {
    try {
      const capture = await captureTwitterPage(
        browserExecutablePath,
        userDataDir,
        storageStatePath,
        source.source_url,
        extractTweetId(source.source_url),
        targetReplyCount,
        maxScrollSteps
      );
      await insertEvidenceRecord(db, { taskId, sourceId: source.id, evidenceType: "twitter_page_capture", title: capture.title, summary: `${capture.pageStatus}: ${capture.statusReason}`.slice(0, 500), rawContent: JSON.stringify(capture, null, 2), credibilityLevel: "low" });
      evidenceCount += 1;
      await insertEvidenceRecord(db, { taskId, sourceId: source.id, evidenceType: "twitter_page_assessment", title: `Twitter page assessment for ${source.source_url}`, summary: `page_status=${capture.pageStatus}; tweet_quality=${capture.tweetQualityScore}; comment_quality=${capture.commentQualityScore}; replies=${capture.replies.length}`.slice(0, 500), rawContent: JSON.stringify({ pageStatus: capture.pageStatus, statusReason: capture.statusReason, tweetQualityScore: capture.tweetQualityScore, commentQualityScore: capture.commentQualityScore, replyCount: capture.replies.length }, null, 2), credibilityLevel: capture.pageStatus === "valid_tweet" ? "medium" : "low" });
      evidenceCount += 1;
      if (capture.mainTweet && capture.pageStatus !== "blocked_wall") {
        await insertEvidenceRecord(db, { taskId, sourceId: source.id, evidenceType: "twitter_post_detail", title: capture.title, summary: buildTweetSummary(capture), rawContent: JSON.stringify(capture.mainTweet, null, 2), credibilityLevel: capture.pageStatus === "valid_tweet" ? "medium" : "low" });
        evidenceCount += 1;
        await insertEvidenceRecord(db, { taskId, sourceId: source.id, evidenceType: "twitter_posts", title: capture.title, summary: buildTweetSummary(capture), rawContent: JSON.stringify({ pageStatus: capture.pageStatus, mainTweet: capture.mainTweet, tweetQualityScore: capture.tweetQualityScore }, null, 2), credibilityLevel: capture.pageStatus === "valid_tweet" ? "medium" : "low" });
        evidenceCount += 1;
      }
      if (capture.replies.length > 0) {
        await insertEvidenceRecord(db, { taskId, sourceId: source.id, evidenceType: "twitter_reply_sample", title: `Reply sample for ${source.source_url}`, summary: `${capture.replies.length} visible replies sampled from the tweet page.`.slice(0, 500), rawContent: JSON.stringify(capture.replies, null, 2), credibilityLevel: capture.pageStatus === "valid_tweet" ? "medium" : "low" });
        evidenceCount += 1;
      }

      if (capture.pageStatus === "blocked_wall") {
        warnings.push(`Twitter browser fetch hit a login wall for ${source.source_url}.`);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
        skippedSources.push(source.source_url);
        continue;
      }
      if (capture.pageStatus === "weak_capture" || capture.pageStatus === "profile_or_unknown") {
        warnings.push(`Twitter browser fetch only produced a weak capture for ${source.source_url}: ${capture.statusReason}`);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
        collectedSources.push(source.source_url);
        sawPartial = true;
        continue;
      }
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
      collectedSources.push(source.source_url);
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(`Twitter browser fetch could not collect ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  if (evidenceCount > 0) {
    await updateTaskStatuses(db, { taskId, collectionStatus: "evidence_ready" });
  }
  const runStatus: "completed" | "partial" | "failed" =
    collectedSources.length === 0 ? "failed" : skippedSources.length > 0 || sawPartial || warnings.length > 0 ? "partial" : "completed";
  await recordCollectionRunPg(db, { taskId, collectorKey: "twitter_browser_fetch", sourceType: "twitter", status: runStatus, collectedCount: collectedSources.length, skippedCount: skippedSources.length, evidenceCount, warnings });
  return { taskId, collectedSources, skippedSources, warnings, evidenceCount };
};
