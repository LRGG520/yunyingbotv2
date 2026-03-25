import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;

const schemaStatements = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    official_website TEXT,
    official_twitter TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS analysis_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_status TEXT NOT NULL,
    collection_status TEXT NOT NULL,
    analysis_status TEXT NOT NULL,
    review_status TEXT NOT NULL,
    final_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS task_inputs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    input_type TEXT NOT NULL,
    raw_value TEXT NOT NULL,
    normalized_value TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_url TEXT NOT NULL,
    is_official INTEGER NOT NULL,
    access_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS evidences (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    raw_content TEXT,
    credibility_level TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id),
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS factors (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    factor_key TEXT NOT NULL,
    factor_name TEXT NOT NULL,
    dimension_key TEXT NOT NULL,
    dimension_name TEXT NOT NULL,
    status TEXT NOT NULL,
    ai_score REAL,
    final_score REAL,
    confidence_level TEXT NOT NULL,
    score_reason TEXT NOT NULL,
    risk_points_json TEXT NOT NULL,
    opportunity_points_json TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS dimensions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    dimension_key TEXT NOT NULL,
    dimension_name TEXT NOT NULL,
    final_score REAL NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL UNIQUE,
    final_score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    summary TEXT NOT NULL,
    data_quality_note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS review_records (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    factor_id TEXT NOT NULL,
    reviewer TEXT NOT NULL,
    old_ai_score REAL,
    old_final_score REAL,
    override_score REAL NOT NULL,
    new_final_score REAL NOT NULL,
    fact_supplement TEXT,
    override_reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id),
    FOREIGN KEY(factor_id) REFERENCES factors(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS report_versions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    version_type TEXT NOT NULL,
    factor_snapshot_json TEXT NOT NULL,
    dimension_snapshot_json TEXT NOT NULL,
    report_snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS collection_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    collector_key TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    collected_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    evidence_count INTEGER NOT NULL,
    warnings_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS community_source_contexts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    source_id TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    target_label TEXT,
    target_kind TEXT,
    requested_window_hours INTEGER NOT NULL,
    effective_window_hours INTEGER,
    history_access_mode TEXT NOT NULL,
    bot_access_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id),
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS community_message_buffer (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    external_chat_id TEXT NOT NULL,
    external_message_id TEXT NOT NULL,
    chat_title TEXT,
    author_id TEXT,
    author_label TEXT,
    text_content TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    raw_payload TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(platform, external_chat_id, external_message_id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS onchain_source_contexts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    source_id TEXT NOT NULL UNIQUE,
    chain_key TEXT NOT NULL,
    chain_label TEXT NOT NULL,
    contract_role_hint TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id),
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS onchain_lp_candidates (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    chain_key TEXT NOT NULL,
    dex_label TEXT NOT NULL,
    quote_token_label TEXT NOT NULL,
    lp_address TEXT NOT NULL,
    confidence TEXT NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_id, lp_address),
    FOREIGN KEY(task_id) REFERENCES analysis_tasks(id),
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )
  `
];

export const getDatabase = (repoRoot: string): DatabaseSync => {
  if (database) {
    return database;
  }

  const localDataDir = path.join(repoRoot, "data", "local");
  mkdirSync(localDataDir, { recursive: true });
  const databasePath = path.join(localDataDir, "yunyingbot.sqlite");
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  for (const statement of schemaStatements) {
    database.exec(statement);
  }

  return database;
};
