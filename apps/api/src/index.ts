import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  analyzeFactors,
  collectDiscordMessages,
  collectOnchain,
  collectTelegramUpdates,
  collectTwitterBrowser,
  collectPublicWebDocs,
  collectTwitterPublic,
  confirmLpCandidate,
  createAnalysisTask,
  createVersionSnapshot,
  deleteTask,
  discoverLpCandidates,
  getFactorDetail,
  getFinalAnalysisReport,
  getDatabase,
  getTaskCollectionRuns,
  getReportView,
  getReportVersions,
  getSourceDetail,
  getTaskSources,
  generateReport,
  getTaskSnapshot,
  getVersionDetail,
  identifyProject,
  listTasks,
  loadRuntimeSnapshot,
  reviewFactor,
  runOfflineAnalysis,
  upsertCommunityEvidence
} from "@yunyingbot/application";
import type { TaskInputPayload } from "@yunyingbot/shared";

const PORT = Number(process.env.PORT ?? 3000);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const db = getDatabase(repoRoot);
const nowIso = () => new Date().toISOString();

const sendJson = (res: http.ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
};

const readJsonBody = async <T>(req: http.IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as T;
};

const matchTaskRoute = (pathname: string, suffix: string): string | null => {
  const pattern = new RegExp(`^/tasks/([^/]+)/${suffix}$`);
  const match = pathname.match(pattern);
  return match?.[1] ?? null;
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "missing_url" });
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "api" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-snapshot") {
    const snapshot = loadRuntimeSnapshot(repoRoot);
    sendJson(res, 200, snapshot);
    return;
  }

  if (req.method === "GET" && url.pathname === "/analysis/sample") {
    const result = runOfflineAnalysis(repoRoot);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/tasks") {
    sendJson(res, 200, { items: listTasks(db) });
    return;
  }

  const deleteTaskId = url.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null;
  if (req.method === "DELETE" && deleteTaskId) {
    try {
      const result = deleteTask(db, deleteTaskId);
      if (!result) {
        sendJson(res, 404, { error: "task_not_found" });
        return;
      }
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: "delete_task_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/tasks/intake") {
    try {
      const body = await readJsonBody<{ inputs: TaskInputPayload[] }>(req);
      if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
        sendJson(res, 400, { error: "missing_inputs" });
        return;
      }

      const provisionalProjectId = randomUUID();
      db.prepare(
        `INSERT INTO projects (id, name, official_website, official_twitter, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(provisionalProjectId, "pending-project", null, null, nowIso(), nowIso());
      const task = createAnalysisTask(db, provisionalProjectId, body.inputs);
      const identifyResult = identifyProject(db, task.taskId, body.inputs, provisionalProjectId);

      sendJson(res, 201, identifyResult);
      return;
    } catch (error) {
      sendJson(res, 500, { error: "intake_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  const collectTaskId = matchTaskRoute(url.pathname, "collect-public");
  if (req.method === "POST" && collectTaskId) {
    try {
      const result = await collectPublicWebDocs(db, collectTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: "collect_public_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  const analyzeTaskId = matchTaskRoute(url.pathname, "analyze-factors");
  if (req.method === "POST" && analyzeTaskId) {
    try {
      const factorResult = await analyzeFactors(db, repoRoot, analyzeTaskId);
      const reportResult = generateReport(db, analyzeTaskId);
      const version = createVersionSnapshot(db, analyzeTaskId, "ai_initial");
      sendJson(res, 200, { factorResult, reportResult, version });
      return;
    } catch (error) {
      sendJson(res, 500, { error: "analyze_factors_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  const collectOnchainTaskId = matchTaskRoute(url.pathname, "collect-onchain");
  if (req.method === "POST" && collectOnchainTaskId) {
    try {
      const result = await collectOnchain(db, repoRoot, collectOnchainTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: "collect_onchain_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  const collectTwitterTaskId = matchTaskRoute(url.pathname, "collect-twitter-public");
  if (req.method === "POST" && collectTwitterTaskId) {
    try {
      const result = await collectTwitterPublic(db, collectTwitterTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "collect_twitter_public_failed",
        message: error instanceof Error ? error.message : "unknown_error"
      });
      return;
    }
  }

  const collectTwitterBrowserTaskId = matchTaskRoute(url.pathname, "collect-twitter-browser");
  if (req.method === "POST" && collectTwitterBrowserTaskId) {
    try {
      const result = await collectTwitterBrowser(db, repoRoot, collectTwitterBrowserTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "collect_twitter_browser_failed",
        message: error instanceof Error ? error.message : "unknown_error"
      });
      return;
    }
  }

  const collectTelegramTaskId = matchTaskRoute(url.pathname, "collect-telegram");
  if (req.method === "POST" && collectTelegramTaskId) {
    try {
      const result = await collectTelegramUpdates(db, repoRoot, collectTelegramTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "collect_telegram_failed",
        message: error instanceof Error ? error.message : "unknown_error"
      });
      return;
    }
  }

  const collectDiscordTaskId = matchTaskRoute(url.pathname, "collect-discord");
  if (req.method === "POST" && collectDiscordTaskId) {
    try {
      const result = await collectDiscordMessages(db, repoRoot, collectDiscordTaskId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "collect_discord_failed",
        message: error instanceof Error ? error.message : "unknown_error"
      });
      return;
    }
  }

  const reviewTaskId = matchTaskRoute(url.pathname, "review-factor");
  if (req.method === "POST" && reviewTaskId) {
    try {
      const body = await readJsonBody<{
        factorId: string;
        reviewer: string;
        overrideScore: number;
        factSupplement?: string;
        overrideReason: string;
      }>(req);

      const result = reviewFactor(db, {
        taskId: reviewTaskId,
        factorId: body.factorId,
        reviewer: body.reviewer,
        overrideScore: body.overrideScore,
        factSupplement: body.factSupplement,
        overrideReason: body.overrideReason
      });

      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: "review_factor_failed", message: error instanceof Error ? error.message : "unknown_error" });
      return;
    }
  }

  const taskSnapshotId = url.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null;
  if (req.method === "GET" && taskSnapshotId) {
    sendJson(res, 200, getTaskSnapshot(db, taskSnapshotId));
    return;
  }

  const factorDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/factors\/([^/]+)$/);
  if (req.method === "GET" && factorDetailMatch) {
    const [, taskId, factorId] = factorDetailMatch;
    const detail = getFactorDetail(db, taskId, factorId);
    if (!detail) {
      sendJson(res, 404, { error: "factor_not_found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  const sourceDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)$/);
  if (req.method === "GET" && sourceDetailMatch) {
    const [, taskId, sourceId] = sourceDetailMatch;
    const detail = getSourceDetail(db, taskId, sourceId);
    if (!detail) {
      sendJson(res, 404, { error: "source_not_found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  const discoverLpCandidateMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)\/discover-lp-candidates$/);
  if (req.method === "POST" && discoverLpCandidateMatch) {
    const [, taskId, sourceId] = discoverLpCandidateMatch;
    try {
      const result = await discoverLpCandidates(db, repoRoot, taskId, sourceId);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      sendJson(res, message.includes("not_found") ? 404 : 500, {
        error: "discover_lp_candidates_failed",
        message
      });
      return;
    }
  }

  const confirmLpCandidateMatch = url.pathname.match(/^\/tasks\/([^/]+)\/lp-candidates\/([^/]+)$/);
  if (req.method === "POST" && confirmLpCandidateMatch) {
    const [, taskId, candidateId] = confirmLpCandidateMatch;
    try {
      const body = await readJsonBody<{ action: "confirm" | "ignore" }>(req);
      const result = confirmLpCandidate(db, taskId, candidateId, body.action);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      sendJson(res, message.includes("not_found") ? 404 : 500, {
        error: "confirm_lp_candidate_failed",
        message
      });
      return;
    }
  }

  const communityEvidenceMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)\/community-evidence$/);
  if (req.method === "POST" && communityEvidenceMatch) {
    const [, taskId, sourceId] = communityEvidenceMatch;
    try {
      const body = await readJsonBody<{
        sourceType: "telegram" | "discord";
        collectorKey?: string;
        requestedWindowHours?: number | null;
        effectiveWindowHours?: number | null;
        historyAccessMode?: string | null;
        botAccessStatus?: string | null;
        windowSummary?: Record<string, unknown> | null;
        structureMetrics?: Record<string, unknown> | null;
        messageSamples?: Array<Record<string, unknown>>;
        qualityAssessment?: Record<string, unknown> | null;
      }>(req);

      const result = upsertCommunityEvidence(db, {
        taskId,
        sourceId,
        sourceType: body.sourceType,
        collectorKey: body.collectorKey ?? `${body.sourceType}_bot_ingestion`,
        requestedWindowHours: body.requestedWindowHours ?? null,
        effectiveWindowHours: body.effectiveWindowHours ?? null,
        historyAccessMode: body.historyAccessMode ?? null,
        botAccessStatus: body.botAccessStatus ?? null,
        windowSummary: body.windowSummary ?? null,
        structureMetrics: body.structureMetrics ?? null,
        messageSamples: body.messageSamples ?? [],
        qualityAssessment: body.qualityAssessment ?? null
      });

      sendJson(res, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      sendJson(res, message === "community_source_not_found" ? 404 : 500, {
        error: "upsert_community_evidence_failed",
        message
      });
      return;
    }
  }

  const reportTaskId = matchTaskRoute(url.pathname, "report");
  if (req.method === "GET" && reportTaskId) {
    const detail = getReportView(db, reportTaskId);
    if (!detail) {
      sendJson(res, 404, { error: "report_not_found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  const finalReportTaskId = matchTaskRoute(url.pathname, "final-analysis-report");
  if (req.method === "GET" && finalReportTaskId) {
    const detail = getFinalAnalysisReport(db, finalReportTaskId);
    if (!detail) {
      sendJson(res, 404, { error: "final_analysis_report_not_found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  const sourcesTaskId = matchTaskRoute(url.pathname, "sources");
  if (req.method === "GET" && sourcesTaskId) {
    sendJson(res, 200, { items: getTaskSources(db, sourcesTaskId) });
    return;
  }

  const collectionRunsTaskId = matchTaskRoute(url.pathname, "collection-runs");
  if (req.method === "GET" && collectionRunsTaskId) {
    sendJson(res, 200, { items: getTaskCollectionRuns(db, collectionRunsTaskId) });
    return;
  }

  const versionsTaskId = matchTaskRoute(url.pathname, "versions");
  if (req.method === "GET" && versionsTaskId) {
    sendJson(res, 200, { items: getReportVersions(db, versionsTaskId) });
    return;
  }

  const versionDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/versions\/([^/]+)$/);
  if (req.method === "GET" && versionDetailMatch) {
    const [, taskId, versionId] = versionDetailMatch;
    const detail = getVersionDetail(db, taskId, versionId);
    if (!detail) {
      sendJson(res, 404, { error: "version_not_found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
