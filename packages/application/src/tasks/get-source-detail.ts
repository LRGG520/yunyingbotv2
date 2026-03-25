import type { DatabaseSync } from "node:sqlite";
import { parseJsonArray, parseJsonObject } from "./parse-json.js";

interface TwitterPostDetailPayload {
  text?: string;
  datetime?: string | null;
  handles?: string[];
  statusIds?: string[];
  metrics?: {
    replies?: number | null;
    reposts?: number | null;
    likes?: number | null;
    bookmarks?: number | null;
    views?: number | null;
  };
}

interface TwitterAssessmentPayload {
  pageStatus?: string;
  statusReason?: string;
  tweetQualityScore?: number;
  commentQualityScore?: number;
  replyCount?: number;
}

interface CommunityWindowSummaryPayload {
  requestedWindowHours?: number;
  effectiveWindowHours?: number | null;
  messageCount?: number;
  speakerCount?: number;
  historyAccessMode?: string;
  botAccessStatus?: string;
}

interface CommunityStructureMetricsPayload {
  activity?: {
    topSpeakersShare?: number | null;
    averageMessagesPerSpeaker?: number | null;
    burstinessScore?: number | null;
  };
  repetition?: {
    duplicateMessageRatio?: number | null;
    shortMessageRatio?: number | null;
    templateSignalRatio?: number | null;
    lowSignalRatio?: number | null;
  };
  discussion?: {
    projectRelevantRatio?: number | null;
    qaInteractionRatio?: number | null;
    offTopicRatio?: number | null;
  };
}

interface CommunityMessageSamplePayload {
  bucket?: string;
  itemCount?: number;
  sampleMessages?: Array<{
    author?: string | null;
    text?: string | null;
    sentAt?: string | null;
  }>;
}

interface CommunityQualityAssessmentPayload {
  overallStatus?: string;
  activityQualityScore?: number | null;
  discussionEffectivenessScore?: number | null;
  participationDepthScore?: number | null;
  botRiskScore?: number | null;
  keyFindings?: string[];
}

interface OnchainRawPayload {
  bytecodePreview?: string;
  latestBlock?: string;
  balance?: string;
  hasCode?: boolean;
}

interface OnchainContractProfilePayload {
  chainKey?: string;
  chainLabel?: string;
  latestBlock?: string;
  hasCode?: boolean;
  nativeBalance?: string;
  tokenMetadata?: {
    name?: string | null;
    symbol?: string | null;
    decimals?: string | null;
    totalSupply?: string | null;
  };
  ownership?: {
    owner?: string | null;
  };
  proxy?: {
    implementationAddress?: string | null;
  };
  detectedInterfaces?: string[];
}

interface OnchainRoleAssessmentPayload {
  roleGuess?: string;
  confidence?: "low" | "medium" | "high";
  reason?: string;
  nextStepHint?: string;
  analysisMode?: "remote_llm" | "rule_fallback";
}

interface OnchainCodeFeaturePayload {
  bytecodeLength?: number;
  selectorCount?: number;
  detectedFeatures?: string[];
  matchedSelectors?: string[];
  codeShape?: "standard_like" | "standard_extended" | "non_standard";
  complexityHint?: "low" | "medium" | "high";
  featureReason?: string;
  boundaryNote?: string;
}

export const getSourceDetail = (db: DatabaseSync, taskId: string, sourceId: string) => {
  const source = db
    .prepare(
      `SELECT
        id,
        source_type,
        source_url,
        is_official,
        access_status,
        created_at,
        updated_at
      FROM sources
      WHERE task_id = ? AND id = ?`
    )
    .get(taskId, sourceId) as
    | {
        id: string;
        source_type: string;
        source_url: string;
        is_official: number;
        access_status: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!source) {
    return null;
  }

  const evidences = db
    .prepare(
      `SELECT
        id,
        evidence_type,
        title,
        summary,
        raw_content,
        credibility_level,
        captured_at
      FROM evidences
      WHERE task_id = ? AND source_id = ?
      ORDER BY captured_at DESC, created_at DESC`
    )
    .all(taskId, sourceId);

  const communityContext = db
    .prepare(
      `SELECT
        platform,
        target_label,
        target_kind,
        requested_window_hours,
        effective_window_hours,
        history_access_mode,
        bot_access_status,
        created_at,
        updated_at
      FROM community_source_contexts
      WHERE task_id = ? AND source_id = ?`
    )
    .get(taskId, sourceId) as
    | {
        platform: string;
        target_label: string | null;
        target_kind: string | null;
        requested_window_hours: number;
        effective_window_hours: number | null;
        history_access_mode: string;
        bot_access_status: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  const onchainContext = db
    .prepare(
      `SELECT
        chain_key,
        chain_label,
        contract_role_hint,
        created_at,
        updated_at
      FROM onchain_source_contexts
      WHERE task_id = ? AND source_id = ?`
    )
    .get(taskId, sourceId) as
    | {
        chain_key: string;
        chain_label: string;
        contract_role_hint: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  const relatedRuns = db
    .prepare(
      `SELECT
        id,
        collector_key,
        source_type,
        status,
        collected_count,
        skipped_count,
        evidence_count,
        warnings_json,
        created_at
      FROM collection_runs
      WHERE task_id = ?
        AND source_type = ?
      ORDER BY created_at DESC
      LIMIT 10`
    )
    .all(taskId, source.source_type) as Array<{
    id: string;
    collector_key: string;
    source_type: string;
    status: string;
    collected_count: number;
    skipped_count: number;
    evidence_count: number;
    warnings_json: string;
    created_at: string;
  }>;

  const twitterPostDetail = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "twitter_post_detail")
    .map((evidence) => parseJsonObject<TwitterPostDetailPayload>((evidence as { raw_content?: string | null }).raw_content))
    .find((value) => value !== null) ?? null;

  const twitterAssessment = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "twitter_page_assessment")
    .map((evidence) => parseJsonObject<TwitterAssessmentPayload>((evidence as { raw_content?: string | null }).raw_content))
    .find((value) => value !== null) ?? null;

  const communityWindowSummary = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "community_window_summary")
    .map((evidence) =>
      parseJsonObject<CommunityWindowSummaryPayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const communityStructureMetrics = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "community_structure_metrics")
    .map((evidence) =>
      parseJsonObject<CommunityStructureMetricsPayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const communityMessageSamples = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "community_message_sample")
    .map((evidence) => ({
      evidenceId: (evidence as { id: string }).id,
      title: (evidence as { title?: string | null }).title ?? null,
      summary: (evidence as { summary?: string | null }).summary ?? null,
      payload: parseJsonObject<CommunityMessageSamplePayload>((evidence as { raw_content?: string | null }).raw_content)
    }))
    .filter((item) => item.payload !== null)
    .map((item) => ({
      evidenceId: item.evidenceId,
      title: item.title,
      summary: item.summary,
      bucket: item.payload?.bucket ?? null,
      itemCount: item.payload?.itemCount ?? null,
      sampleMessages: item.payload?.sampleMessages ?? []
    }));

  const communityQualityAssessment = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "community_quality_assessment")
    .map((evidence) =>
      parseJsonObject<CommunityQualityAssessmentPayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const onchainMetric = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "onchain_metric")
    .map((evidence) => parseJsonObject<OnchainRawPayload>((evidence as { raw_content?: string | null }).raw_content))
    .find((value) => value !== null) ?? null;

  const onchainContractProfile = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "onchain_contract_profile")
    .map((evidence) =>
      parseJsonObject<OnchainContractProfilePayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const onchainRoleAssessment = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "onchain_role_assessment")
    .map((evidence) =>
      parseJsonObject<OnchainRoleAssessmentPayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const onchainCodeFeatures = evidences
    .filter((evidence) => (evidence as { evidence_type: string }).evidence_type === "onchain_code_features")
    .map((evidence) =>
      parseJsonObject<OnchainCodeFeaturePayload>((evidence as { raw_content?: string | null }).raw_content)
    )
    .find((value) => value !== null) ?? null;

  const lpCandidates = db
    .prepare(
      `SELECT id, dex_label, quote_token_label, lp_address, confidence, rationale, status, created_at, updated_at
       FROM onchain_lp_candidates
       WHERE task_id = ? AND source_id = ?
       ORDER BY created_at DESC`
    )
    .all(taskId, sourceId) as Array<{
    id: string;
    dex_label: string;
    quote_token_label: string;
    lp_address: string;
    confidence: string;
    rationale: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  return {
    source,
    evidences,
    communityContext: communityContext ?? null,
    onchainContext: onchainContext
      ? {
          chainKey: onchainContext.chain_key,
          chainLabel: onchainContext.chain_label,
          contractRoleHint: onchainContext.contract_role_hint,
          createdAt: onchainContext.created_at,
          updatedAt: onchainContext.updated_at
        }
      : null,
    communityDetail:
      source.source_type === "telegram" || source.source_type === "discord"
        ? {
            windowSummary: communityWindowSummary
              ? {
                  requestedWindowHours: communityWindowSummary.requestedWindowHours ?? null,
                  effectiveWindowHours: communityWindowSummary.effectiveWindowHours ?? null,
                  messageCount: communityWindowSummary.messageCount ?? null,
                  speakerCount: communityWindowSummary.speakerCount ?? null,
                  historyAccessMode: communityWindowSummary.historyAccessMode ?? null,
                  botAccessStatus: communityWindowSummary.botAccessStatus ?? null
                }
              : null,
            structureMetrics: communityStructureMetrics
              ? {
                  activity: communityStructureMetrics.activity ?? null,
                  repetition: communityStructureMetrics.repetition ?? null,
                  discussion: communityStructureMetrics.discussion ?? null
                }
              : null,
            messageSamples: communityMessageSamples,
            qualityAssessment: communityQualityAssessment
              ? {
                  overallStatus: communityQualityAssessment.overallStatus ?? null,
                  activityQualityScore: communityQualityAssessment.activityQualityScore ?? null,
                  discussionEffectivenessScore: communityQualityAssessment.discussionEffectivenessScore ?? null,
                  participationDepthScore: communityQualityAssessment.participationDepthScore ?? null,
                  botRiskScore: communityQualityAssessment.botRiskScore ?? null,
                  keyFindings: communityQualityAssessment.keyFindings ?? []
                }
              : null
          }
        : null,
    twitterDetail:
      source.source_type === "twitter"
        ? {
            pageStatus: twitterAssessment?.pageStatus ?? null,
            statusReason: twitterAssessment?.statusReason ?? null,
            tweetQualityScore: twitterAssessment?.tweetQualityScore ?? null,
            commentQualityScore: twitterAssessment?.commentQualityScore ?? null,
            visibleReplyCount: twitterAssessment?.replyCount ?? null,
            text: twitterPostDetail?.text ?? null,
            publishedAt: twitterPostDetail?.datetime ?? null,
            metrics: twitterPostDetail?.metrics ?? null
          }
        : null,
    onchainDetail:
      source.source_type === "contract"
        ? {
            chainLabel: onchainContext?.chain_label ?? null,
            contractRoleHint: onchainContext?.contract_role_hint ?? null,
            latestBlock: onchainMetric?.latestBlock ?? null,
            balance: onchainMetric?.balance ?? null,
            hasCode: onchainMetric?.hasCode ?? null,
            contractProfile: onchainContractProfile
              ? {
                  detectedInterfaces: onchainContractProfile.detectedInterfaces ?? [],
                  tokenMetadata: {
                    name: onchainContractProfile.tokenMetadata?.name ?? null,
                    symbol: onchainContractProfile.tokenMetadata?.symbol ?? null,
                    decimals: onchainContractProfile.tokenMetadata?.decimals ?? null,
                    totalSupply: onchainContractProfile.tokenMetadata?.totalSupply ?? null
                  },
                  ownership: {
                    owner: onchainContractProfile.ownership?.owner ?? null
                  },
                  proxy: {
                    implementationAddress: onchainContractProfile.proxy?.implementationAddress ?? null
                  }
                }
              : null,
            roleAssessment: onchainRoleAssessment
              ? {
                  roleGuess: onchainRoleAssessment.roleGuess ?? null,
                  confidence: onchainRoleAssessment.confidence ?? null,
                  reason: onchainRoleAssessment.reason ?? null,
                  nextStepHint: onchainRoleAssessment.nextStepHint ?? null,
                  analysisMode: onchainRoleAssessment.analysisMode ?? null
                }
              : null,
            codeFeatures: onchainCodeFeatures
              ? {
                  bytecodeLength: onchainCodeFeatures.bytecodeLength ?? null,
                  selectorCount: onchainCodeFeatures.selectorCount ?? null,
                  detectedFeatures: onchainCodeFeatures.detectedFeatures ?? [],
                  matchedSelectors: onchainCodeFeatures.matchedSelectors ?? [],
                  codeShape: onchainCodeFeatures.codeShape ?? null,
                  complexityHint: onchainCodeFeatures.complexityHint ?? null,
                  featureReason: onchainCodeFeatures.featureReason ?? null,
                  boundaryNote: onchainCodeFeatures.boundaryNote ?? null
                }
              : null,
            lpCandidates: lpCandidates.map((item) => ({
              id: item.id,
              dexLabel: item.dex_label,
              quoteTokenLabel: item.quote_token_label,
              lpAddress: item.lp_address,
              confidence: item.confidence,
              rationale: item.rationale,
              status: item.status,
              createdAt: item.created_at,
              updatedAt: item.updated_at
            }))
          }
        : null,
    relatedRuns: relatedRuns.map((run) => ({
      id: run.id,
      collector_key: run.collector_key,
      source_type: run.source_type,
      status: run.status,
      collected_count: run.collected_count,
      skipped_count: run.skipped_count,
      evidence_count: run.evidence_count,
      created_at: run.created_at,
      warnings: parseJsonArray(run.warnings_json)
    }))
  };
};
