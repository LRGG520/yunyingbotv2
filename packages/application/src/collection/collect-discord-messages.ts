import { randomUUID } from "node:crypto";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { upsertCommunityEvidence } from "../community/upsert-community-evidence.js";
import { loadRepoEnv } from "../config/load-env.js";

type DiscordInviteResponse = {
  guild?: {
    id: string;
    name?: string;
  };
};

type DiscordChannel = {
  id: string;
  name?: string;
  type: number;
  parent_id?: string | null;
  position?: number;
};

type DiscordMessage = {
  id: string;
  content?: string;
  timestamp: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    bot?: boolean;
  };
  webhook_id?: string | null;
  type?: number;
};

type BufferedCommunityMessage = {
  externalMessageId: string;
  sentAt: string;
  sentAtUnix: number;
  authorId: string | null;
  authorLabel: string;
  text: string;
  channelId: string | null;
  channelName: string | null;
};

const DISCORD_API_BASE = "https://discord.com/api/v10";
const nowIso = () => new Date().toISOString();

const LOW_SIGNAL_EXACT_MATCHES = new Set([
  "gm",
  "gn",
  "gg",
  "hi",
  "hello",
  "ok",
  "okay",
  "wow",
  "nice",
  "lol",
  "lfg",
  "thanks",
  "thank you",
  "haha",
  "hahaha"
]);

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim();

const isLowSignalMessage = (text: string): boolean => {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;
  if (LOW_SIGNAL_EXACT_MATCHES.has(normalized)) return true;
  if (normalized.length <= 3 && !/[a-z0-9]/i.test(normalized)) return true;
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\W_]+$/u.test(normalized)) return true;
  return false;
};

const keywordMatch = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const computeRatio = (count: number, total: number): number | null => {
  if (!total) return null;
  return Number((count / total).toFixed(4));
};

const sampleUnique = <T>(items: T[], limit: number, keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
};

const extractDiscordInviteCode = (sourceUrl: string, fallbackLabel?: string | null): string | null => {
  if (fallbackLabel) return fallbackLabel;

  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
};

const requestDiscord = async <T>(token: string, pathname: string) => {
  const response = await fetch(`${DISCORD_API_BASE}${pathname}`, {
    headers: {
      Authorization: `Bot ${token}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord request failed for ${pathname}: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
};

const isCandidateChannel = (channel: DiscordChannel): boolean => {
  if (channel.type !== 0) return false;
  const name = (channel.name ?? "").toLowerCase();
  const blockedPatterns = [
    "rules",
    "announcement",
    "announcements",
    "verify",
    "verification",
    "role",
    "roles",
    "log",
    "logs",
    "ticket",
    "tickets",
    "support",
    "bot",
    "admin",
    "mod",
    "staff",
    "faq",
    "guide",
    "readme",
    "news"
  ];
  return !blockedPatterns.some((pattern) => name.includes(pattern));
};

const insertDiscordMessagesIntoBuffer = async (
  db: AppDbClient,
  guildId: string,
  guildName: string,
  channel: DiscordChannel,
  messages: DiscordMessage[]
) => {
  const now = nowIso();

  for (const message of messages) {
    const text = normalizeText(message.content ?? "");
    if (!text) continue;
    if (message.author?.bot || message.webhook_id) continue;
    if ((message.type ?? 0) !== 0) continue;

    await db.execute(
      `INSERT INTO community_message_buffer (
        id, platform, external_chat_id, external_message_id, chat_title, author_id, author_label, text_content, sent_at, raw_payload, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (platform, external_chat_id, external_message_id) DO NOTHING`,
      [
        randomUUID(),
        "discord",
        guildId,
        message.id,
        guildName,
        message.author?.id ?? null,
        message.author?.global_name ?? message.author?.username ?? "unknown",
        text,
        message.timestamp,
        JSON.stringify({
          guildId,
          guildName,
          channelId: channel.id,
          channelName: channel.name ?? null,
          message
        }),
        now
      ]
    );
  }
};

const readBufferedDiscordMessages = async (
  db: AppDbClient,
  guildId: string,
  requestedWindowHours: number
): Promise<BufferedCommunityMessage[]> => {
  const sinceIso = new Date(Date.now() - requestedWindowHours * 60 * 60 * 1000).toISOString();

  const rows = await db.query<{
    external_message_id: string;
    sent_at: string;
    author_id: string | null;
    author_label: string | null;
    text_content: string;
    raw_payload: string | null;
  }>(
    `SELECT external_message_id, sent_at, author_id, author_label, text_content, raw_payload
     FROM community_message_buffer
     WHERE platform = 'discord'
       AND external_chat_id = $1
       AND sent_at >= $2
     ORDER BY sent_at ASC`,
    [guildId, sinceIso]
  );

  return rows.map((row) => {
    const raw = row.raw_payload ? JSON.parse(row.raw_payload) as { channelId?: string; channelName?: string } : {};
    return {
      externalMessageId: row.external_message_id,
      sentAt: row.sent_at,
      sentAtUnix: Math.floor(new Date(row.sent_at).getTime() / 1000),
      authorId: row.author_id,
      authorLabel: row.author_label ?? "unknown",
      text: row.text_content,
      channelId: raw.channelId ?? null,
      channelName: raw.channelName ?? null
    };
  });
};

export const collectDiscordMessages = async (
  db: AppDbClient,
  repoRoot: string,
  taskId: string
): Promise<PublicCollectionResult> => {
  const env = loadRepoEnv(repoRoot);
  const token = env.DISCORD_BOT_TOKEN?.trim();

  const sources = await db.query<{
    id: string;
    source_url: string;
    target_label: string | null;
    requested_window_hours: number | null;
  }>(
    `SELECT
       s.id,
       s.source_url,
       c.target_label,
       c.requested_window_hours
     FROM sources s
     LEFT JOIN community_source_contexts c ON c.source_id = s.id AND c.task_id = s.task_id
     WHERE s.task_id = $1
       AND s.source_type = 'discord'`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;

  if (!token) {
    warnings.push("DISCORD_BOT_TOKEN is not configured.");
    return { taskId, collectedSources, skippedSources: sources.map((source) => source.source_url), warnings, evidenceCount };
  }

  if (sources.length === 0) {
    warnings.push("Current task has no Discord source.");
    return { taskId, collectedSources, skippedSources, warnings, evidenceCount };
  }

  for (const source of sources) {
    const inviteCode = extractDiscordInviteCode(source.source_url, source.target_label);
    if (!inviteCode) {
      warnings.push(`Could not infer Discord invite code from ${source.source_url}`);
      skippedSources.push(source.source_url);
      continue;
    }

    let invite: DiscordInviteResponse;
    try {
      invite = await requestDiscord<DiscordInviteResponse>(token, `/invites/${encodeURIComponent(inviteCode)}?with_counts=true`);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Discord invite fetch failed for ${inviteCode}.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const guildId = invite.guild?.id;
    const guildName = invite.guild?.name ?? inviteCode;
    if (!guildId) {
      warnings.push(`Discord invite ${inviteCode} did not resolve to a guild.`);
      skippedSources.push(source.source_url);
      continue;
    }

    let channels: DiscordChannel[];
    try {
      channels = await requestDiscord<DiscordChannel[]>(token, `/guilds/${guildId}/channels`);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Discord channels fetch failed for ${guildName}.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const candidateChannels = channels
      .filter(isCandidateChannel)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .slice(0, 12);

    let selectedChannelCount = 0;
    for (const channel of candidateChannels) {
      try {
        const messages = await requestDiscord<DiscordMessage[]>(token, `/channels/${channel.id}/messages?limit=50`);
        const usableMessages = messages.filter((message) => {
          const text = normalizeText(message.content ?? "");
          return text.length > 0 && !message.author?.bot && !message.webhook_id && (message.type ?? 0) === 0;
        });
        if (usableMessages.length === 0) continue;
        await insertDiscordMessagesIntoBuffer(db, guildId, guildName, channel, usableMessages);
        selectedChannelCount += 1;
        if (selectedChannelCount >= 8) break;
      } catch {
        continue;
      }
    }

    const requestedWindowHours = source.requested_window_hours ?? 72;
    const bufferedMessages = await readBufferedDiscordMessages(db, guildId, requestedWindowHours);
    if (bufferedMessages.length === 0) {
      warnings.push(`Discord buffer has no readable messages for ${guildName} in the requested ${requestedWindowHours}h window.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const totalMessages = bufferedMessages.length;
    const uniqueAuthors = new Set(bufferedMessages.map((message) => message.authorId ?? message.authorLabel)).size;
    const authorCounts = new Map<string, number>();
    const textCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();

    for (const message of bufferedMessages) {
      const authorKey = message.authorId ?? message.authorLabel;
      authorCounts.set(authorKey, (authorCounts.get(authorKey) ?? 0) + 1);
      textCounts.set(message.text.toLowerCase(), (textCounts.get(message.text.toLowerCase()) ?? 0) + 1);
      const channelKey = message.channelName ?? message.channelId ?? "unknown";
      channelCounts.set(channelKey, (channelCounts.get(channelKey) ?? 0) + 1);
    }

    const topSpeakers = Array.from(authorCounts.values()).sort((a, b) => b - a).slice(0, 10);
    const topSpeakersShare = computeRatio(topSpeakers.reduce((sum, count) => sum + count, 0), totalMessages);
    const averageMessagesPerSpeaker = uniqueAuthors ? Number((totalMessages / uniqueAuthors).toFixed(2)) : null;
    const duplicateMessages = Array.from(textCounts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
    const duplicateMessageRatio = computeRatio(duplicateMessages, totalMessages);
    const shortMessageRatio = computeRatio(bufferedMessages.filter((message) => message.text.length <= 12).length, totalMessages);
    const templateSignalRatio = computeRatio(
      bufferedMessages.filter((message) => (textCounts.get(message.text.toLowerCase()) ?? 0) >= 3).length,
      totalMessages
    );

    const contentBearingMessages = bufferedMessages.filter((message) => !isLowSignalMessage(message.text));
    const lowSignalRatio = computeRatio(totalMessages - contentBearingMessages.length, totalMessages);

    const guildKeywords = guildName
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((part) => part.length >= 2);
    const projectKeywords = Array.from(new Set([...guildKeywords, "token", "launch", "listing", "tge", "bridge", "alpha", "farm", "staking"]));
    const projectRelevantMessages = contentBearingMessages.filter((message) => keywordMatch(message.text, projectKeywords));
    const questionMessages = contentBearingMessages.filter(
      (message) => /\?$/.test(message.text) || /^(how|what|when|why|wen|where)\b/i.test(message.text)
    );
    const offTopicMessages = contentBearingMessages.filter(
      (message) => !keywordMatch(message.text, projectKeywords) && message.text.length <= 20
    );

    const timestamps = bufferedMessages.map((message) => message.sentAtUnix).sort((a, b) => a - b);
    const effectiveWindowHours =
      timestamps.length >= 2 ? Number((((timestamps.at(-1) ?? timestamps[0]) - timestamps[0]) / 3600).toFixed(2)) : 0;

    const repeatedMessages = bufferedMessages.filter((message) => (textCounts.get(message.text.toLowerCase()) ?? 0) >= 2);
    const repeatedContentMessages = repeatedMessages.filter((message) => !isLowSignalMessage(message.text));
    const baselineSamplePool = contentBearingMessages.length >= 5 ? contentBearingMessages : bufferedMessages;

    const activityQualityScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            5.6 +
            (averageMessagesPerSpeaker && averageMessagesPerSpeaker >= 2 ? 0.6 : -0.4) +
            (topSpeakersShare !== null && topSpeakersShare < 0.65 ? 0.7 : -0.8) +
            (shortMessageRatio !== null && shortMessageRatio < 0.45 ? 0.5 : -0.6) +
            (lowSignalRatio !== null && lowSignalRatio < 0.35 ? 0.4 : -0.5)
          ).toFixed(1)
        )
      )
    );

    const discussionEffectivenessScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            4.9 +
            ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) * 8) +
            ((computeRatio(questionMessages.length, totalMessages) ?? 0) * 4) -
            ((computeRatio(offTopicMessages.length, totalMessages) ?? 0) * 3) -
            ((lowSignalRatio ?? 0) * 3)
          ).toFixed(1)
        )
      )
    );

    const participationDepthScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            4.6 +
            (uniqueAuthors >= 8 ? 0.8 : -0.6) +
            ((computeRatio(questionMessages.length, totalMessages) ?? 0) * 4) +
            ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) * 3)
          ).toFixed(1)
        )
      )
    );

    const botRiskScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            3.9 +
            ((duplicateMessageRatio ?? 0) * 8) +
            ((templateSignalRatio ?? 0) * 8) +
            (topSpeakersShare !== null && topSpeakersShare > 0.75 ? 1.2 : 0)
          ).toFixed(1)
        )
      )
    );

    const topChannels = Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([channelName, count]) => `${channelName} (${count})`);

    const keyFindings: string[] = [];
    keyFindings.push(`Window contains ${totalMessages} messages from ${uniqueAuthors} active speakers across ${channelCounts.size} channels.`);
    if (topSpeakersShare !== null) {
      keyFindings.push(`Top 10 speakers contribute ${Math.round(topSpeakersShare * 100)}% of visible messages.`);
    }
    if (duplicateMessageRatio !== null) {
      keyFindings.push(`Duplicate text ratio is ${Math.round(duplicateMessageRatio * 100)}%.`);
    }
    if (topChannels.length > 0) {
      keyFindings.push(`Most active channels: ${topChannels.join(", ")}.`);
    }
    if ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) > 0.2) {
      keyFindings.push("A meaningful portion of visible messages is project-related.");
    }
    if (effectiveWindowHours < requestedWindowHours) {
      keyFindings.push(`Effective visible window is about ${effectiveWindowHours}h, below the requested ${requestedWindowHours}h.`);
    }

    const overallStatus =
      botRiskScore >= 7 ? "high_risk" : discussionEffectivenessScore >= 6 && activityQualityScore >= 6 ? "healthy" : "moderate";

    const result = await upsertCommunityEvidence(db, {
      taskId,
      sourceId: source.id,
      sourceType: "discord",
      collectorKey: "discord_bot_ingestion",
      requestedWindowHours,
      effectiveWindowHours,
      historyAccessMode: effectiveWindowHours >= requestedWindowHours ? "historical_read" : "live_only",
      botAccessStatus: "bot_ready",
      windowSummary: {
        requestedWindowHours,
        effectiveWindowHours,
        messageCount: totalMessages,
        speakerCount: uniqueAuthors,
        historyAccessMode: effectiveWindowHours >= requestedWindowHours ? "historical_read" : "live_only",
        botAccessStatus: "bot_ready",
        channelCount: channelCounts.size,
        topChannels
      },
      structureMetrics: {
        activity: {
          topSpeakersShare,
          averageMessagesPerSpeaker,
          burstinessScore: null
        },
        repetition: {
          duplicateMessageRatio,
          shortMessageRatio,
          templateSignalRatio,
          lowSignalRatio
        },
        discussion: {
          projectRelevantRatio: computeRatio(projectRelevantMessages.length, totalMessages),
          qaInteractionRatio: computeRatio(questionMessages.length, totalMessages),
          offTopicRatio: computeRatio(offTopicMessages.length, totalMessages)
        }
      },
      messageSamples: [
        {
          title: "Most repeated content",
          summary: "Representative repeated Discord messages within the selected server.",
          bucket: "repeated_messages",
          itemCount: repeatedMessages.length,
          sampleMessages: sampleUnique(
            (repeatedContentMessages.length >= 4 ? repeatedContentMessages : repeatedMessages).map((message) => ({
              author: message.authorLabel,
              text: message.text,
              sentAt: message.sentAt
            })),
            6,
            (message) => `${message.author ?? ""}:${message.text ?? ""}`
          )
        },
        {
          title: "Project-related discussion",
          summary: "Messages that mention project-specific or launch-related keywords.",
          bucket: "project_relevant",
          itemCount: projectRelevantMessages.length,
          sampleMessages: sampleUnique(
            projectRelevantMessages.map((message) => ({
              author: message.authorLabel,
              text: message.text,
              sentAt: message.sentAt
            })),
            6,
            (message) => `${message.author ?? ""}:${message.text ?? ""}`
          )
        },
        {
          title: "Question and answer signals",
          summary: "Messages that look like questions or interactive prompts.",
          bucket: "qa_messages",
          itemCount: questionMessages.length,
          sampleMessages: sampleUnique(
            questionMessages.map((message) => ({
              author: message.authorLabel,
              text: message.text,
              sentAt: message.sentAt
            })),
            6,
            (message) => `${message.author ?? ""}:${message.text ?? ""}`
          )
        },
        {
          title: "Baseline activity sample",
          summary: "General visible messages sampled from the current Discord window.",
          bucket: "baseline_messages",
          itemCount: baselineSamplePool.length,
          sampleMessages: sampleUnique(
            baselineSamplePool.map((message) => ({
              author: message.authorLabel,
              text: `${message.channelName ? `#${message.channelName}: ` : ""}${message.text}`,
              sentAt: message.sentAt
            })),
            8,
            (message) => `${message.author ?? ""}:${message.text ?? ""}`
          )
        }
      ],
      qualityAssessment: {
        overallStatus,
        activityQualityScore,
        discussionEffectivenessScore,
        participationDepthScore,
        botRiskScore,
        keyFindings
      }
    });

    evidenceCount += result.evidenceCount;
    collectedSources.push(source.source_url);

    if (updatesNeedFlush(selectedChannelCount, warnings)) {
      // no-op placeholder to keep branch explicit for future checkpointing
    }
  }

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};

const updatesNeedFlush = (_selectedChannelCount: number, _warnings: string[]) => false;
