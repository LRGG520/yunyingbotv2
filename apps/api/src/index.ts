import http from 'node:http';
import path from 'node:path';
import { collectPublicDomain } from './collect-public-domain.js';
import {
  analyzeFactors,
  collectDiscordMessages,
  collectOnchain,
  collectTelegramUpdates,
  collectTwitterBrowser,
  collectTwitterPublic,
  collectWhitepaperPdf,
  confirmLpCandidate,
  createAnalysisTaskPg,
  createVersionSnapshot,
  deleteTask,
  discoverLpCandidates,
  getFactorDetail,
  getFinalAnalysisReport,
  getPostgresDatabase,
  getReportVersions,
  getReportView,
  getSourceDetail,
  getTaskCollectionRuns,
  getTaskSnapshot,
  getTaskSources,
  getVersionDetail,
  listTasks,
  loadRuntimeSnapshot,
  migratePostgres,
  reviewFactor,
  runOfflineAnalysis,
  uploadWhitepaperDocumentPg,
  upsertCommunityEvidence
} from '@yunyingbot/application';
import type { TaskInputPayload } from '@yunyingbot/shared';

const PORT = Number(process.env.PORT ?? 3000);
const INTAKE_DEDUP_WINDOW_MINUTES = Number(process.env.INTAKE_DEDUP_WINDOW_MINUTES ?? 10);
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const db = getPostgresDatabase();

const sendJson = (res: http.ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
};

const readJsonBody = async <T>(req: http.IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
};

const matchTaskRoute = (pathname: string, suffix: string): string | null => pathname.match(new RegExp(`^/tasks/([^/]+)/${suffix}$`))?.[1] ?? null;
const sendPending = (res: http.ServerResponse, route: string) => sendJson(res, 409, { error: 'runtime_cutover_pending', message: `${route} is pending PostgreSQL migration.` });

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'missing_url' });
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, service: 'api', db: 'postgres' });
  if (req.method === 'GET' && url.pathname === '/runtime-snapshot') return sendJson(res, 200, loadRuntimeSnapshot(repoRoot));
  if (req.method === 'GET' && url.pathname === '/analysis/sample') return sendJson(res, 200, runOfflineAnalysis(repoRoot));
  if (req.method === 'GET' && url.pathname === '/tasks') return sendJson(res, 200, { items: await listTasks(db) });

  const deleteTaskId = url.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null;
  if (req.method === 'DELETE' && deleteTaskId) {
    try {
      const result = await deleteTask(db, deleteTaskId);
      return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'task_not_found' });
    } catch (error) {
      return sendJson(res, 500, { error: 'delete_task_failed', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/tasks/intake') {
    try {
      const body = await readJsonBody<{ inputs: TaskInputPayload[]; disableDedupe?: boolean }>(req);
      if (!Array.isArray(body.inputs) || body.inputs.length === 0) return sendJson(res, 400, { error: 'missing_inputs' });
      const dedupeWindow = body.disableDedupe ? 0 : INTAKE_DEDUP_WINDOW_MINUTES;
      const result = await createAnalysisTaskPg(db, body.inputs, dedupeWindow);
      return sendJson(res, 'deduped' in result ? 200 : 201, result);
    } catch (error) {
      return sendJson(res, 500, { error: 'intake_failed', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }

  const collectPublicTaskId = matchTaskRoute(url.pathname, 'collect-public');
  if (req.method === 'POST' && collectPublicTaskId) {
    try {
      return sendJson(res, 200, await collectPublicDomain(db, collectPublicTaskId));
    } catch (error) {
      return sendJson(res, 500, { error: 'collect_public_failed', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }

  const collectWhitepaperTaskId = matchTaskRoute(url.pathname, 'collect-whitepaper-pdf');
  if (req.method === 'POST' && collectWhitepaperTaskId) {
    try { return sendJson(res, 200, await collectWhitepaperPdf(db, collectWhitepaperTaskId)); } catch (error) { return sendJson(res, 500, { error: 'collect_whitepaper_pdf_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
  }

  const uploadWhitepaperTaskId = matchTaskRoute(url.pathname, 'upload-whitepaper-document');
  if (req.method === 'POST' && uploadWhitepaperTaskId) {
    try {
      const body = await readJsonBody<{ fileName: string; mimeType?: string | null; contentBase64: string }>(req);
      return sendJson(res, 201, await uploadWhitepaperDocumentPg(db, repoRoot, uploadWhitepaperTaskId, body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      if (message === 'task_not_found') return sendJson(res, 404, { error: 'task_not_found' });
      if (message === 'empty_document' || message === 'unsupported_document_type') return sendJson(res, 400, { error: message });
      return sendJson(res, 500, { error: 'upload_whitepaper_document_failed', message });
    }
  }

  const analyzeTaskId = matchTaskRoute(url.pathname, 'analyze-factors');
  if (req.method === 'POST' && analyzeTaskId) {
    try {
      const factorResult = await analyzeFactors(db, repoRoot, analyzeTaskId);
      const reportResult = await (await import('@yunyingbot/application')).generateReport(db, analyzeTaskId);
      const version = await createVersionSnapshot(db, analyzeTaskId, 'ai_initial');
      return sendJson(res, 200, { factorResult, reportResult, version });
    } catch (error) {
      return sendJson(res, 500, { error: 'analyze_factors_failed', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }

  const collectOnchainTaskId = matchTaskRoute(url.pathname, 'collect-onchain');
  if (req.method === 'POST' && collectOnchainTaskId) {
    try { return sendJson(res, 200, await collectOnchain(db, repoRoot, collectOnchainTaskId)); } catch (error) { return sendJson(res, 500, { error: 'collect_onchain_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
  }

  const collectTwitterTaskId = matchTaskRoute(url.pathname, 'collect-twitter-public');
  if (req.method === 'POST' && collectTwitterTaskId) {
    try { return sendJson(res, 200, await collectTwitterPublic(db, collectTwitterTaskId)); } catch (error) { return sendJson(res, 500, { error: 'collect_twitter_public_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
  }

  const collectTwitterBrowserTaskId = matchTaskRoute(url.pathname, 'collect-twitter-browser');
  if (req.method === 'POST' && collectTwitterBrowserTaskId) {
    try {
      const queued = await (await import('@yunyingbot/application')).enqueueTwitterBrowserJob(db, collectTwitterBrowserTaskId);
      return sendJson(res, 202, { taskId: collectTwitterBrowserTaskId, jobId: queued.jobId, queueStatus: queued.status, deduped: queued.deduped, collectedSources: [], skippedSources: [], warnings: [queued.deduped ? 'Twitter browser collection job already exists for this task and has been reused.' : 'Twitter browser collection job has been queued and will be processed by worker.'], evidenceCount: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      return message === 'task_not_found' ? sendJson(res, 404, { error: 'task_not_found' }) : sendJson(res, 500, { error: 'collect_twitter_browser_failed', message });
    }
  }

  const collectTelegramTaskId = matchTaskRoute(url.pathname, 'collect-telegram');
  if (req.method === 'POST' && collectTelegramTaskId) {
    try { return sendJson(res, 200, await collectTelegramUpdates(db, repoRoot, collectTelegramTaskId)); } catch (error) { return sendJson(res, 500, { error: 'collect_telegram_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
  }

  const collectDiscordTaskId = matchTaskRoute(url.pathname, 'collect-discord');
  if (req.method === 'POST' && collectDiscordTaskId) {
    try { return sendJson(res, 200, await collectDiscordMessages(db, repoRoot, collectDiscordTaskId)); } catch (error) { return sendJson(res, 500, { error: 'collect_discord_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
  }

  const reviewTaskId = matchTaskRoute(url.pathname, 'review-factor');
  if (req.method === 'POST' && reviewTaskId) {
    try {
      const body = await readJsonBody<{ factorId: string; reviewer: string; overrideScore: number; factSupplement?: string; overrideReason: string }>(req);
      return sendJson(res, 200, await reviewFactor(db, { taskId: reviewTaskId, factorId: body.factorId, reviewer: body.reviewer, overrideScore: body.overrideScore, factSupplement: body.factSupplement, overrideReason: body.overrideReason }));
    } catch (error) {
      return sendJson(res, 500, { error: 'review_factor_failed', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }

  const taskSnapshotId = url.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null;
  if (req.method === 'GET' && taskSnapshotId) {
    const detail = await getTaskSnapshot(db, taskSnapshotId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'task_not_found' });
  }

  const factorDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/factors\/([^/]+)$/);
  if (req.method === 'GET' && factorDetailMatch) {
    const [, taskId, factorId] = factorDetailMatch;
    const detail = await getFactorDetail(db, taskId, factorId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'factor_not_found' });
  }

  const sourceDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)$/);
  if (req.method === 'GET' && sourceDetailMatch) {
    const [, taskId, sourceId] = sourceDetailMatch;
    const detail = await getSourceDetail(db, taskId, sourceId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'source_not_found' });
  }

  const discoverLpCandidateMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)\/discover-lp-candidates$/);
  if (req.method === 'POST' && discoverLpCandidateMatch) {
    const [, taskId, sourceId] = discoverLpCandidateMatch;
    try { return sendJson(res, 200, await discoverLpCandidates(db, repoRoot, taskId, sourceId)); } catch (error) { const message = error instanceof Error ? error.message : 'unknown_error'; return sendJson(res, message.includes('not_found') ? 404 : 500, { error: 'discover_lp_candidates_failed', message }); }
  }

  const confirmLpCandidateMatch = url.pathname.match(/^\/tasks\/([^/]+)\/lp-candidates\/([^/]+)$/);
  if (req.method === 'POST' && confirmLpCandidateMatch) {
    const [, taskId, candidateId] = confirmLpCandidateMatch;
    try { const body = await readJsonBody<{ action: 'confirm' | 'ignore' }>(req); return sendJson(res, 200, await confirmLpCandidate(db, taskId, candidateId, body.action)); } catch (error) { const message = error instanceof Error ? error.message : 'unknown_error'; return sendJson(res, message.includes('not_found') ? 404 : 500, { error: 'confirm_lp_candidate_failed', message }); }
  }

  const communityEvidenceMatch = url.pathname.match(/^\/tasks\/([^/]+)\/sources\/([^/]+)\/community-evidence$/);
  if (req.method === 'POST' && communityEvidenceMatch) {
    const [, taskId, sourceId] = communityEvidenceMatch;
    try {
      const body = await readJsonBody<{ sourceType: 'telegram' | 'discord'; collectorKey?: string; requestedWindowHours?: number | null; effectiveWindowHours?: number | null; historyAccessMode?: string | null; botAccessStatus?: string | null; windowSummary?: Record<string, unknown> | null; structureMetrics?: Record<string, unknown> | null; messageSamples?: Array<Record<string, unknown>>; qualityAssessment?: Record<string, unknown> | null }>(req);
      return sendJson(res, 200, await upsertCommunityEvidence(db, { taskId, sourceId, sourceType: body.sourceType, collectorKey: body.collectorKey ?? `${body.sourceType}_bot_ingestion`, requestedWindowHours: body.requestedWindowHours ?? null, effectiveWindowHours: body.effectiveWindowHours ?? null, historyAccessMode: body.historyAccessMode ?? null, botAccessStatus: body.botAccessStatus ?? null, windowSummary: body.windowSummary ?? null, structureMetrics: body.structureMetrics ?? null, messageSamples: body.messageSamples ?? [], qualityAssessment: body.qualityAssessment ?? null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      return sendJson(res, message === 'community_source_not_found' ? 404 : 500, { error: 'upsert_community_evidence_failed', message });
    }
  }

  const reportTaskId = matchTaskRoute(url.pathname, 'report');
  if (req.method === 'GET' && reportTaskId) {
    const detail = await getReportView(db, reportTaskId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'report_not_found' });
  }

  const finalReportTaskId = matchTaskRoute(url.pathname, 'final-analysis-report');
  if (req.method === 'GET' && finalReportTaskId) {
    const detail = await getFinalAnalysisReport(db, finalReportTaskId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'final_analysis_report_not_found' });
  }

  const sourcesTaskId = matchTaskRoute(url.pathname, 'sources');
  if (req.method === 'GET' && sourcesTaskId) return sendJson(res, 200, { items: await getTaskSources(db, sourcesTaskId) });

  const collectionRunsTaskId = matchTaskRoute(url.pathname, 'collection-runs');
  if (req.method === 'GET' && collectionRunsTaskId) return sendJson(res, 200, { items: await getTaskCollectionRuns(db, collectionRunsTaskId) });

  const versionsTaskId = matchTaskRoute(url.pathname, 'versions');
  if (req.method === 'GET' && versionsTaskId) return sendJson(res, 200, { items: await getReportVersions(db, versionsTaskId) });

  const versionDetailMatch = url.pathname.match(/^\/tasks\/([^/]+)\/versions\/([^/]+)$/);
  if (req.method === 'GET' && versionDetailMatch) {
    const [, taskId, versionId] = versionDetailMatch;
    const detail = await getVersionDetail(db, taskId, versionId);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'version_not_found' });
  }

  sendJson(res, 404, { error: 'not_found' });
});

const start = async () => {
  await migratePostgres();
  console.log('[api] PostgreSQL runtime enabled');
  server.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
};

void start();
