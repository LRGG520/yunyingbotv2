import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";
import { recordCollectionRunPg } from "../collection/record-collection-run-pg.js";

const nowIso = () => new Date().toISOString();

export interface UpsertCommunityEvidenceInput {
  taskId: string;
  sourceId: string;
  collectorKey: string;
  sourceType: "telegram" | "discord";
  requestedWindowHours?: number | null;
  effectiveWindowHours?: number | null;
  historyAccessMode?: string | null;
  botAccessStatus?: string | null;
  windowSummary?: Record<string, unknown> | null;
  structureMetrics?: Record<string, unknown> | null;
  messageSamples?: Array<Record<string, unknown>>;
  qualityAssessment?: Record<string, unknown> | null;
}

const insertEvidence = async (
  db: AppDbClient,
  taskId: string,
  sourceId: string,
  evidenceType: string,
  title: string,
  summary: string,
  rawContent: unknown
) => {
  const now = nowIso();
  await db.execute(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(), taskId, sourceId, evidenceType, title, summary, JSON.stringify(rawContent, null, 2), "medium", now, now]
  );
};

const deleteEvidenceType = async (db: AppDbClient, taskId: string, sourceId: string, evidenceType: string) => {
  await db.execute(`DELETE FROM evidences WHERE task_id = $1 AND source_id = $2 AND evidence_type = $3`, [taskId, sourceId, evidenceType]);
};

export const upsertCommunityEvidence = async (db: AppDbClient, input: UpsertCommunityEvidenceInput) => {
  const source = await db.one(`SELECT id FROM sources WHERE task_id = $1 AND id = $2 AND source_type = $3`, [
    input.taskId,
    input.sourceId,
    input.sourceType
  ]);
  if (!source) throw new Error("community_source_not_found");

  const now = nowIso();
  let evidenceCount = 0;
  const requestedWindowHours = input.requestedWindowHours ?? null;
  const effectiveWindowHours =
    input.effectiveWindowHours === null || input.effectiveWindowHours === undefined
      ? null
      : Math.max(0, Math.round(input.effectiveWindowHours));

  await db.execute(
    `UPDATE community_source_contexts
     SET requested_window_hours = COALESCE($1, requested_window_hours),
         effective_window_hours = $2,
         history_access_mode = COALESCE($3, history_access_mode),
         bot_access_status = COALESCE($4, bot_access_status),
         updated_at = $5
     WHERE task_id = $6 AND source_id = $7`,
    [requestedWindowHours, effectiveWindowHours, input.historyAccessMode ?? null, input.botAccessStatus ?? null, now, input.taskId, input.sourceId]
  );

  if (input.windowSummary) {
    await deleteEvidenceType(db, input.taskId, input.sourceId, "community_window_summary");
    await insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_window_summary",
      "Community window summary",
      `Requested ${requestedWindowHours ?? "--"}h, effective ${input.effectiveWindowHours ?? requestedWindowHours ?? "--"}h.`,
      input.windowSummary
    );
    evidenceCount += 1;
  }

  if (input.structureMetrics) {
    await deleteEvidenceType(db, input.taskId, input.sourceId, "community_structure_metrics");
    await insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_structure_metrics",
      "Community structure metrics",
      "Activity concentration, repetition, low-signal ratio, and discussion effectiveness indicators.",
      input.structureMetrics
    );
    evidenceCount += 1;
  }

  if (Array.isArray(input.messageSamples)) {
    await deleteEvidenceType(db, input.taskId, input.sourceId, "community_message_sample");
    for (const sample of input.messageSamples) {
      await insertEvidence(
        db,
        input.taskId,
        input.sourceId,
        "community_message_sample",
        String(sample.title ?? "Community message sample"),
        String(sample.summary ?? "Community message sample"),
        sample
      );
      evidenceCount += 1;
    }
  }

  if (input.qualityAssessment) {
    await deleteEvidenceType(db, input.taskId, input.sourceId, "community_quality_assessment");
    await insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_quality_assessment",
      "Community quality assessment",
      `Overall status: ${String(input.qualityAssessment.overallStatus ?? "unknown")}.`,
      input.qualityAssessment
    );
    evidenceCount += 1;
  }

  await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, [evidenceCount > 0 ? "partial" : "pending", now, input.sourceId]);
  await db.execute(`UPDATE analysis_tasks SET collection_status = $1, updated_at = $2 WHERE id = $3`, [evidenceCount > 0 ? "evidence_ready" : "collecting", now, input.taskId]);

  await recordCollectionRunPg(db, {
    taskId: input.taskId,
    collectorKey: input.collectorKey,
    sourceType: input.sourceType,
    status: evidenceCount > 0 ? "partial" : "failed",
    collectedCount: evidenceCount > 0 ? 1 : 0,
    skippedCount: 0,
    evidenceCount,
    warnings: evidenceCount > 0 ? [] : ["No community evidence payload was provided."]
  });

  return {
    taskId: input.taskId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    collectorKey: input.collectorKey,
    evidenceCount,
    updatedContext: {
      requestedWindowHours,
      effectiveWindowHours,
      historyAccessMode: input.historyAccessMode ?? null,
      botAccessStatus: input.botAccessStatus ?? null
    }
  };
};
