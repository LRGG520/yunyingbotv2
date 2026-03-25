import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const nowIso = () => new Date().toISOString();

export const confirmLpCandidate = (
  db: DatabaseSync,
  taskId: string,
  candidateId: string,
  action: "confirm" | "ignore"
) => {
  const candidate = db
    .prepare(
      `SELECT id, task_id, source_id, chain_key, dex_label, quote_token_label, lp_address, status
       FROM onchain_lp_candidates
       WHERE task_id = ? AND id = ?`
    )
    .get(taskId, candidateId) as
    | {
        id: string;
        task_id: string;
        source_id: string;
        chain_key: string;
        dex_label: string;
        quote_token_label: string;
        lp_address: string;
        status: string;
      }
    | undefined;

  if (!candidate) {
    throw new Error("lp_candidate_not_found");
  }

  const now = nowIso();

  if (action === "ignore") {
    db.prepare(`UPDATE onchain_lp_candidates SET status = ?, updated_at = ? WHERE id = ?`).run("ignored", now, candidate.id);
    return {
      candidateId,
      action: "ignored",
      createdSourceId: null
    };
  }

  const existingSource = db
    .prepare(`SELECT id FROM sources WHERE task_id = ? AND source_type = 'contract' AND source_url = ?`)
    .get(taskId, candidate.lp_address) as { id: string } | undefined;

  let createdSourceId = existingSource?.id ?? null;

  if (!existingSource) {
    const originSource = db
      .prepare(`SELECT project_id FROM sources WHERE id = ? AND task_id = ?`)
      .get(candidate.source_id, taskId) as { project_id: string } | undefined;
    if (!originSource) {
      throw new Error("origin_contract_source_not_found");
    }

    createdSourceId = randomUUID();
    db.prepare(
      `INSERT INTO sources (id, project_id, task_id, source_type, source_url, is_official, access_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(createdSourceId, originSource.project_id, taskId, "contract", candidate.lp_address, 0, "pending", now, now);

    db.prepare(
      `INSERT INTO onchain_source_contexts (id, task_id, source_id, chain_key, chain_label, contract_role_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      taskId,
      createdSourceId,
      candidate.chain_key,
      candidate.chain_key === "bsc"
        ? "BNB Chain"
        : candidate.chain_key === "ethereum"
          ? "Ethereum"
          : candidate.chain_key === "polygon"
            ? "Polygon"
            : candidate.chain_key === "avalanche"
              ? "Avalanche C-Chain"
              : candidate.chain_key,
      "lp_pair",
      now,
      now
    );
  }

  db.prepare(`UPDATE onchain_lp_candidates SET status = ?, updated_at = ? WHERE id = ?`).run("confirmed", now, candidate.id);

  return {
    candidateId,
    action: "confirmed",
    createdSourceId
  };
};
