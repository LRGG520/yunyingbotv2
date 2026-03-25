import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { IntakeTaskResult, SourceCandidate, TaskInputPayload } from "@yunyingbot/shared";

const nowIso = () => new Date().toISOString();

const extractHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const inferSource = (value: string): SourceCandidate => {
  const trimmed = value.trim();

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { sourceType: "contract", sourceUrl: trimmed, isOfficial: false };
  }

  const hostname = extractHostname(trimmed);
  if (!hostname) {
    return { sourceType: "unknown", sourceUrl: trimmed, isOfficial: false };
  }

  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    return { sourceType: "twitter", sourceUrl: trimmed, isOfficial: true };
  }

  if (hostname.includes("t.me") || hostname.includes("telegram.me")) {
    return { sourceType: "telegram", sourceUrl: trimmed, isOfficial: true };
  }

  if (hostname.includes("discord.gg") || hostname.includes("discord.com")) {
    return { sourceType: "discord", sourceUrl: trimmed, isOfficial: true };
  }

  if (trimmed.endsWith(".pdf")) {
    return { sourceType: "whitepaper", sourceUrl: trimmed, isOfficial: true };
  }

  if (hostname.startsWith("docs.") || trimmed.includes("/docs") || trimmed.includes("gitbook")) {
    return { sourceType: "docs", sourceUrl: trimmed, isOfficial: true };
  }

  return { sourceType: "website", sourceUrl: trimmed, isOfficial: true };
};

const extractTwitterHandle = (value: string): string | null => {
  const hostname = extractHostname(value);
  if (!hostname || (!hostname.includes("twitter.com") && !hostname.includes("x.com"))) {
    return null;
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const inferCommunityTargetLabel = (sourceType: SourceCandidate["sourceType"], value: string): string | null => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);

    if (sourceType === "telegram") {
      return parts[0] ?? null;
    }

    if (sourceType === "discord") {
      if (url.hostname.includes("discord.gg")) {
        return parts[0] ?? null;
      }

      if (url.hostname.includes("discord.com")) {
        return parts.at(-1) ?? null;
      }
    }

    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
};

const inferCommunityTargetKind = (sourceType: SourceCandidate["sourceType"], value: string): string | null => {
  try {
    const url = new URL(value);

    if (sourceType === "telegram") {
      return url.pathname.includes("/joinchat/") ? "invite" : "group_or_channel";
    }

    if (sourceType === "discord") {
      if (url.hostname.includes("discord.gg")) {
        return "invite";
      }
      if (/\/channels\//.test(url.pathname)) {
        return "server_channel";
      }
      return "server";
    }

    return null;
  } catch {
    return null;
  }
};

const inferProjectName = (inputs: TaskInputPayload[], candidates: SourceCandidate[]): string => {
  const websiteCandidate = candidates.find((candidate) => candidate.sourceType === "website");
  if (websiteCandidate) {
    const hostname = extractHostname(websiteCandidate.sourceUrl);
    if (hostname) {
      return hostname.replace(/^www\./, "").split(".")[0];
    }
  }

  const twitterCandidate = candidates.find((candidate) => candidate.sourceType === "twitter");
  if (twitterCandidate) {
    return extractTwitterHandle(twitterCandidate.sourceUrl) ?? "unknown-project";
  }

  const textInput = inputs.find((input) => input.type === "text");
  if (textInput) {
    const meaningfulText = inputs
      .filter((input) => input.type === "text")
      .map((input) => input.value.trim())
      .find((value) => value.length > 0 && !/^chain:/i.test(value));
    if (meaningfulText) {
      return meaningfulText.slice(0, 32).trim() || "unknown-project";
    }
  }

  const contractCandidate = candidates.find((candidate) => candidate.sourceType === "contract");
  if (contractCandidate) {
    return `${contractCandidate.sourceUrl.slice(0, 8)}...`;
  }

  return "unknown-project";
};

const extractRequestedChain = (inputs: TaskInputPayload[]): string | null => {
  const chainInput = inputs
    .filter((input) => input.type === "text")
    .map((input) => input.value.trim())
    .find((value) => /^chain:/i.test(value));

  if (!chainInput) {
    return null;
  }

  return chainInput.replace(/^chain:/i, "").trim().toLowerCase() || null;
};

const normalizeChainLabel = (chainKey: string | null) => {
  const labels: Record<string, string> = {
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    base: "Base",
    arbitrum: "Arbitrum",
    polygon: "Polygon",
    optimism: "Optimism",
    avalanche: "Avalanche C-Chain"
  };

  if (!chainKey) {
    return { chainKey: "ethereum", chainLabel: "Ethereum" };
  }

  return {
    chainKey,
    chainLabel: labels[chainKey] ?? chainKey
  };
};

export const identifyProject = (
  db: DatabaseSync,
  taskId: string,
  inputs: TaskInputPayload[],
  preferredProjectId?: string
): IntakeTaskResult => {
  const sourceCandidates = inputs.filter((input) => input.type === "url").map((input) => inferSource(input.value));
  const uncertainties: string[] = [];
  const requestedChain = normalizeChainLabel(extractRequestedChain(inputs));

  if (!sourceCandidates.some((candidate) => candidate.sourceType === "website")) {
    uncertainties.push("No official website was confidently identified.");
  }

  const inferredProjectName = inferProjectName(inputs, sourceCandidates);
  const now = nowIso();
  const projectId = preferredProjectId ?? randomUUID();
  const projectName = inferredProjectName;

  const officialWebsite = sourceCandidates.find((candidate) => candidate.sourceType === "website")?.sourceUrl ?? null;
  const officialTwitter = sourceCandidates.find((candidate) => candidate.sourceType === "twitter")?.sourceUrl ?? null;

  if (preferredProjectId) {
    db.prepare(
      `UPDATE projects
       SET name = ?, official_website = ?, official_twitter = ?, updated_at = ?
       WHERE id = ?`
    ).run(projectName, officialWebsite, officialTwitter, now, preferredProjectId);
  } else {
    db.prepare(
      `INSERT INTO projects (id, name, official_website, official_twitter, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, projectName, officialWebsite, officialTwitter, now, now);
  }

  const insertSource = db.prepare(
    `INSERT INTO sources (id, project_id, task_id, source_type, source_url, is_official, access_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertCommunityContext = db.prepare(
    `INSERT INTO community_source_contexts (
      id, task_id, source_id, platform, target_label, target_kind,
      requested_window_hours, effective_window_hours, history_access_mode, bot_access_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOnchainContext = db.prepare(
    `INSERT INTO onchain_source_contexts (
      id, task_id, source_id, chain_key, chain_label, contract_role_hint, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const candidate of sourceCandidates) {
    const sourceId = randomUUID();
    insertSource.run(
      sourceId,
      projectId,
      taskId,
      candidate.sourceType,
      candidate.sourceUrl,
      candidate.isOfficial ? 1 : 0,
      "pending",
      now,
      now
    );

    if (candidate.sourceType === "telegram" || candidate.sourceType === "discord") {
      insertCommunityContext.run(
        randomUUID(),
        taskId,
        sourceId,
        candidate.sourceType,
        inferCommunityTargetLabel(candidate.sourceType, candidate.sourceUrl),
        inferCommunityTargetKind(candidate.sourceType, candidate.sourceUrl),
        72,
        null,
        "unknown",
        "pending_bot_access",
        now,
        now
      );
    }

    if (candidate.sourceType === "contract") {
      insertOnchainContext.run(
        randomUUID(),
        taskId,
        sourceId,
        requestedChain.chainKey,
        requestedChain.chainLabel,
        null,
        now,
        now
      );
    }
  }

  db.prepare(`UPDATE analysis_tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run("collecting", now, taskId);

  return {
    taskId,
    projectId,
    projectName,
    identifiedSources: sourceCandidates,
    uncertainties
  };
};
