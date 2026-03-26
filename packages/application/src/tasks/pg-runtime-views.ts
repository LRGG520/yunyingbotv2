import type { AppDbClient } from "../db/client.js";
import { parseJsonArray, parseJsonObject } from "./parse-json.js";

type ReportRow = {
  final_score: number;
  risk_level: string;
  summary: string;
  data_quality_note: string;
};

type DimensionRow = {
  dimension_key: string;
  dimension_name: string;
  final_score: number;
  summary: string;
};

type FactorRow = {
  id: string;
  factor_key: string;
  factor_name: string;
  dimension_key: string;
  dimension_name: string;
  status: string;
  final_score: number | null;
  score_reason: string;
  risk_points_json: string;
  opportunity_points_json: string;
  evidence_refs_json: string;
  confidence_level?: string;
};

type EvidenceRow = {
  id: string;
  source_id: string;
  evidence_type: string;
  title: string | null;
  summary: string | null;
  credibility_level: string;
  captured_at: string;
  raw_content?: string | null;
};

interface TwitterPostDetailPayload {
  text?: string;
  datetime?: string | null;
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
  tweetQualityScore?: number | null;
  commentQualityScore?: number | null;
  replyCount?: number | null;
}

interface CommunityWindowSummaryPayload {
  requestedWindowHours?: number | null;
  effectiveWindowHours?: number | null;
  messageCount?: number | null;
  speakerCount?: number | null;
  historyAccessMode?: string | null;
  botAccessStatus?: string | null;
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
  overallStatus?: string | null;
  activityQualityScore?: number | null;
  discussionEffectivenessScore?: number | null;
  participationDepthScore?: number | null;
  botRiskScore?: number | null;
  keyFindings?: string[];
}

interface OnchainRawPayload {
  latestBlock?: string;
  balance?: string;
  hasCode?: boolean;
}

interface OnchainContractProfilePayload {
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

interface ContentDomainPagePayload {
  domainType?: "website" | "docs" | "whitepaper";
  pageUrl?: string;
  title?: string | null;
  heading?: string | null;
  contentLength?: number | null;
  cleanText?: string | null;
  text?: string | null;
  sectionType?: "full_document" | "section";
  sectionCount?: number | null;
}

type VersionMeta = {
  id: string;
  version_type: string;
  created_at: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  product_maturity: "产品成熟度",
  community_user_health: "社区与用户健康度",
  bot_risk: "Bot 风险",
  growth_potential: "增长潜力",
  cross_validation: "交叉验证可信度",
  overall_risk: "综合风险等级"
};

const FACTOR_LABELS: Record<string, string> = {
  website_completeness: "官网完整度",
  whitepaper_depth: "白皮书深度",
  product_functionality: "产品功能可用性",
  onchain_product_presence: "链上产品落地信号",
  twitter_content_quality: "Twitter 内容质量",
  community_activity_quality: "社区活跃质量",
  effective_user_signals: "有效用户信号",
  user_purchasing_power_signals: "用户购买力信号",
  twitter_abnormal_engagement: "Twitter 异常互动信号",
  community_bot_patterns: "社区 Bot / 模板化信号",
  user_structure_anomaly: "用户结构异常信号",
  narrative_market_fit: "叙事与市场方向匹配度",
  campaign_product_fit: "活动与产品匹配度",
  regional_fit: "区域结构匹配度",
  claim_whitepaper_consistency: "项目说法与白皮书一致性",
  whitepaper_onchain_consistency: "白皮书与链上表现一致性",
  community_onchain_consistency: "社区与链上表现一致性",
  timeline_risk: "时间窗口风险",
  team_size_risk: "团队规模风险",
  budget_risk: "预算风险"
};

const SOURCE_GROUP_LABELS: Record<string, string> = {
  website_page: "官网 / 文档",
  docs_page: "官网 / 文档",
  whitepaper_page: "官网 / 文档",
  twitter_posts: "Twitter",
  twitter_post_detail: "Twitter",
  twitter_page_assessment: "Twitter",
  twitter_page_capture: "Twitter",
  community_window_summary: "Telegram / Discord",
  community_structure_metrics: "Telegram / Discord",
  community_message_sample: "Telegram / Discord",
  community_quality_assessment: "Telegram / Discord",
  onchain_metric: "链上"
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险"
};

const DECISION_LABELS: Record<string, string> = {
  high: "建议谨慎推进",
  medium: "建议继续观察并优先复核关键问题",
  low: "建议进入下一步策略设计"
};

const cleanReason = (value: string) => value.replace(/\s+Analysis mode: .+?\.$/, "").trim();
const summarizeDimension = (score: number): string =>
  score < 4 ? "该维度明显偏弱，已经对整体判断形成拖累。" : score < 7 ? "该维度表现中性偏弱，仍需结合关键问题继续复核。" : "该维度相对稳健，可作为当前结论中的积极支撑项。";
const factorImpactText = (factor: FactorRow): string =>
  (factor.final_score ?? 0) < 4 ? "该问题对整体判断形成明显负面影响。" : (factor.final_score ?? 0) < 7 ? "该问题对整体判断形成中性偏弱影响。" : "该项表现相对稳定，对整体判断形成一定支撑。";
const overallJudgement = (riskLevel: string) =>
  riskLevel === "high" ? "当前项目整体风险偏高，不适合直接进入积极推进状态。" : riskLevel === "medium" ? "当前项目具备继续评估空间，但仍需优先处理关键风险与证据不足项。" : "当前项目整体状态相对稳定，可进入下一步策略讨论。";
const conclusionText = (riskLevel: string) =>
  riskLevel === "high" ? "建议暂不直接推进，应先围绕高风险维度补证据并完成重点复核。" : riskLevel === "medium" ? "建议继续推进，但进入策略层前应先确认关键问题是否可被修正。" : "建议进入策略层，围绕当前较强维度制定更明确的运营方案。";

const pickLatestVersion = (versions: VersionMeta[]) => {
  const priority = ["final_confirmed", "human_revised", "ai_initial"];
  for (const versionType of priority) {
    const hit = versions.find((item) => item.version_type === versionType);
    if (hit) return hit;
  }
  return versions[0] ?? null;
};

const buildContentDomainOverview = (evidences: EvidenceRow[]) => {
  const contentEvidences = evidences
    .filter((evidence) =>
      evidence.evidence_type === "website_page" ||
      evidence.evidence_type === "docs_page" ||
      evidence.evidence_type === "whitepaper_page"
    )
    .map((evidence) => ({
      evidenceType: evidence.evidence_type,
      payload: parseJsonObject<ContentDomainPagePayload>(evidence.raw_content),
      title: evidence.title
    }))
    .filter((item) => item.payload !== null);

  if (contentEvidences.length === 0) {
    return null;
  }

  const websitePages = contentEvidences.filter((item) => item.evidenceType === "website_page");
  const docsPages = contentEvidences.filter((item) => item.evidenceType === "docs_page");
  const whitepaperSections = contentEvidences.filter(
    (item) => item.evidenceType === "whitepaper_page" && item.payload?.sectionType === "section"
  );
  const whitepaperWhole = contentEvidences.find(
    (item) => item.evidenceType === "whitepaper_page" && item.payload?.sectionType === "full_document"
  );

  const totalCharacters = contentEvidences.reduce((sum, item) => {
    const length =
      item.payload?.contentLength ??
      item.payload?.cleanText?.length ??
      item.payload?.text?.length ??
      0;
    return sum + (Number.isFinite(length) ? Number(length) : 0);
  }, 0);

  const sampleTopics = Array.from(
    new Set(
      contentEvidences
        .map((item) => item.payload?.heading ?? item.payload?.title ?? item.title ?? "")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 10);

  return {
    website_page_count: websitePages.length,
    docs_page_count: docsPages.length,
    whitepaper_section_count: whitepaperWhole?.payload?.sectionCount ?? whitepaperSections.length,
    total_characters: totalCharacters,
    sample_topics: sampleTopics,
    note: `本次内容资料面已扩展：官网 ${websitePages.length} 页、Docs ${docsPages.length} 页、白皮书章节 ${whitepaperWhole?.payload?.sectionCount ?? whitepaperSections.length} 段。`
  };
};

export const getTaskSnapshotPg = async (db: AppDbClient, taskId: string) => {
  const [task, project, factors, versions, counts, report, inputs, sources, dimensions] = await Promise.all([
    db.one(`SELECT * FROM analysis_tasks WHERE id = $1`, [taskId]),
    db.one(
      `SELECT p.* FROM projects p JOIN analysis_tasks t ON t.project_id = p.id WHERE t.id = $1`,
      [taskId]
    ),
    db.query<{ id: string; factor_name: string; dimension_name: string; final_score: number; status: string; confidence_level: string }>(
      `SELECT id, factor_name, dimension_name, final_score, status, confidence_level
       FROM factors WHERE task_id = $1 ORDER BY dimension_name, factor_name`,
      [taskId]
    ),
    db.query<VersionMeta>(
      `SELECT id, version_type, created_at FROM report_versions WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId]
    ),
    Promise.all([
      db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM task_inputs WHERE task_id = $1`, [taskId]),
      db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM sources WHERE task_id = $1`, [taskId]),
      db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM evidences WHERE task_id = $1`, [taskId]),
      db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM dimensions WHERE task_id = $1`, [taskId]),
      db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM review_records WHERE task_id = $1`, [taskId])
    ]),
    db.one(`SELECT * FROM reports WHERE task_id = $1`, [taskId]),
    db.query(
      `SELECT id, input_type, raw_value, normalized_value, created_at
       FROM task_inputs
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [taskId]
    ),
    db.query(
      `SELECT s.id, s.source_type, s.source_url, s.is_official, s.access_status, s.created_at, s.updated_at,
              osc.chain_key, osc.chain_label, osc.contract_role_hint
       FROM sources s
       LEFT JOIN onchain_source_contexts osc ON osc.task_id = s.task_id AND osc.source_id = s.id
       WHERE s.task_id = $1
       ORDER BY s.created_at ASC, s.source_type ASC`,
      [taskId]
    ),
    db.query(
      `SELECT dimension_key, dimension_name, final_score, summary
       FROM dimensions
       WHERE task_id = $1
       ORDER BY dimension_name ASC`,
      [taskId]
    )
  ]);

  if (!task || !project) {
    return null;
  }

  const [inputCount, sourceCount, evidenceCount, dimensionCount, reviewCount] = counts;
  return {
    task,
    project,
    report,
    summary: {
      inputCount: inputCount?.count ?? 0,
      sourceCount: sourceCount?.count ?? 0,
      evidenceCount: evidenceCount?.count ?? 0,
      factorCount: factors.length,
      dimensionCount: dimensionCount?.count ?? 0,
      reviewCount: reviewCount?.count ?? 0,
      versionCount: versions.length
    },
    inputs,
    sources,
    evidences: [],
    factors,
    dimensions,
    reviews: [],
    versions
  };
};

export const getReportViewPg = async (db: AppDbClient, taskId: string) => {
  const report = await db.one(`SELECT * FROM reports WHERE task_id = $1`, [taskId]);
  if (!report) return null;
  const dimensions = await db.query(
    `SELECT dimension_key, dimension_name, final_score, summary FROM dimensions WHERE task_id = $1 ORDER BY dimension_name`,
    [taskId]
  );
  return { report, dimensions };
};

export const getReportVersionsPg = async (db: AppDbClient, taskId: string) =>
  db.query(`SELECT id, version_type, created_at FROM report_versions WHERE task_id = $1 ORDER BY created_at DESC`, [taskId]);

export const getVersionDetailPg = async (db: AppDbClient, taskId: string, versionId: string) => {
  const row = await db.one<{
    id: string;
    version_type: string;
    factor_snapshot_json: string;
    dimension_snapshot_json: string;
    report_snapshot_json: string;
    created_at: string;
  }>(
    `SELECT id, version_type, factor_snapshot_json, dimension_snapshot_json, report_snapshot_json, created_at
     FROM report_versions WHERE task_id = $1 AND id = $2`,
    [taskId, versionId]
  );
  if (!row) return null;
  return {
    id: row.id,
    version_type: row.version_type,
    created_at: row.created_at,
    factor_snapshot: parseJsonObject<unknown[]>(row.factor_snapshot_json) ?? [],
    dimension_snapshot: parseJsonObject<unknown[]>(row.dimension_snapshot_json) ?? [],
    report_snapshot: parseJsonObject<Record<string, unknown>>(row.report_snapshot_json) ?? null
  };
};

export const getSourceDetailPg = async (db: AppDbClient, taskId: string, sourceId: string) => {
  const [source, evidences, communityContext, onchainContext, relatedRuns, lpCandidates] = await Promise.all([
    db.one(
      `SELECT id, source_type, source_url, is_official, access_status, created_at, updated_at
       FROM sources WHERE task_id = $1 AND id = $2`,
      [taskId, sourceId]
    ),
    db.query<EvidenceRow>(
      `SELECT id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at
       FROM evidences WHERE task_id = $1 AND source_id = $2 ORDER BY captured_at DESC, created_at DESC`,
      [taskId, sourceId]
    ),
    db.one(
      `SELECT platform, target_label, target_kind, requested_window_hours, effective_window_hours,
              history_access_mode, bot_access_status, created_at, updated_at
       FROM community_source_contexts WHERE task_id = $1 AND source_id = $2`,
      [taskId, sourceId]
    ),
    db.one(
      `SELECT chain_key, chain_label, contract_role_hint, created_at, updated_at
       FROM onchain_source_contexts WHERE task_id = $1 AND source_id = $2`,
      [taskId, sourceId]
    ),
    db.query(
      `SELECT id, collector_key, source_type, status, collected_count, skipped_count, evidence_count, warnings_json, created_at
       FROM collection_runs WHERE task_id = $1
         AND source_type = (SELECT source_type FROM sources WHERE id = $2)
       ORDER BY created_at DESC LIMIT 10`,
      [taskId, sourceId]
    ),
    db.query(
      `SELECT id, dex_label, quote_token_label, lp_address, confidence, rationale, status, created_at, updated_at
       FROM onchain_lp_candidates
       WHERE task_id = $1 AND source_id = $2
       ORDER BY created_at DESC`,
      [taskId, sourceId]
    )
  ]);
  if (!source) return null;

  const twitterPostDetail =
    evidences
      .filter((evidence) => evidence.evidence_type === "twitter_post_detail")
      .map((evidence) => parseJsonObject<TwitterPostDetailPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const twitterAssessment =
    evidences
      .filter((evidence) => evidence.evidence_type === "twitter_page_assessment")
      .map((evidence) => parseJsonObject<TwitterAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityWindowSummary =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_window_summary")
      .map((evidence) => parseJsonObject<CommunityWindowSummaryPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityStructureMetrics =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_structure_metrics")
      .map((evidence) => parseJsonObject<CommunityStructureMetricsPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityMessageSamples = evidences
    .filter((evidence) => evidence.evidence_type === "community_message_sample")
    .map((evidence) => ({
      evidenceId: evidence.id,
      title: evidence.title,
      summary: evidence.summary,
      payload: parseJsonObject<CommunityMessageSamplePayload>(evidence.raw_content)
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
  const communityQualityAssessment =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_quality_assessment")
      .map((evidence) => parseJsonObject<CommunityQualityAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const onchainMetric =
    evidences
      .filter((evidence) => evidence.evidence_type === "onchain_metric")
      .map((evidence) => parseJsonObject<OnchainRawPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const onchainContractProfile =
    evidences
      .filter((evidence) => evidence.evidence_type === "onchain_contract_profile")
      .map((evidence) => parseJsonObject<OnchainContractProfilePayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const onchainRoleAssessment =
    evidences
      .filter((evidence) => evidence.evidence_type === "onchain_role_assessment")
      .map((evidence) => parseJsonObject<OnchainRoleAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const onchainCodeFeatures =
    evidences
      .filter((evidence) => evidence.evidence_type === "onchain_code_features")
      .map((evidence) => parseJsonObject<OnchainCodeFeaturePayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  return {
    source: {
      ...(source as Record<string, unknown>),
      is_official: (source as { is_official: boolean }).is_official ? 1 : 0
    },
    communityContext,
    onchainContext: onchainContext
      ? {
          chainKey: (onchainContext as { chain_key: string }).chain_key,
          chainLabel: (onchainContext as { chain_label: string }).chain_label,
          contractRoleHint: (onchainContext as { contract_role_hint: string | null }).contract_role_hint,
          createdAt: (onchainContext as { created_at: string }).created_at,
          updatedAt: (onchainContext as { updated_at: string }).updated_at
        }
      : null,
    communityDetail:
      (source as { source_type: string }).source_type === "telegram" || (source as { source_type: string }).source_type === "discord"
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
    evidences: evidences.map((item) => ({
      id: item.id,
      evidence_type: item.evidence_type,
      title: item.title,
      summary: item.summary,
      credibility_level: item.credibility_level,
      captured_at: item.captured_at
    })),
    twitterDetail:
      (source as { source_type: string }).source_type === "twitter"
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
      (source as { source_type: string }).source_type === "contract"
        ? {
            chainLabel: (onchainContext as { chain_label?: string } | null)?.chain_label ?? null,
            contractRoleHint: (onchainContext as { contract_role_hint?: string | null } | null)?.contract_role_hint ?? null,
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
              id: (item as { id: string }).id,
              dexLabel: (item as { dex_label: string }).dex_label,
              quoteTokenLabel: (item as { quote_token_label: string }).quote_token_label,
              lpAddress: (item as { lp_address: string }).lp_address,
              confidence: (item as { confidence: string }).confidence,
              rationale: (item as { rationale: string }).rationale,
              status: (item as { status: string }).status,
              createdAt: (item as { created_at: string }).created_at,
              updatedAt: (item as { updated_at: string }).updated_at
            }))
          }
        : null,
    relatedRuns: relatedRuns.map((run) => ({
      ...(run as Record<string, unknown>),
      warnings: parseJsonArray((run as { warnings_json?: string }).warnings_json)
    }))
  };
};

export const getFactorDetailPg = async (db: AppDbClient, taskId: string, factorId: string) => {
  const factor = await db.one<Record<string, unknown>>(`SELECT * FROM factors WHERE task_id = $1 AND id = $2`, [taskId, factorId]);
  if (!factor) return null;
  const reviews = await db.query(`SELECT * FROM review_records WHERE task_id = $1 AND factor_id = $2 ORDER BY created_at DESC`, [
    taskId,
    factorId
  ]);
  const evidenceIds = parseJsonArray((factor as { evidence_refs_json?: string }).evidence_refs_json);
  const evidences =
    evidenceIds.length > 0
      ? await db.query<EvidenceRow>(
          `SELECT id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at
           FROM evidences WHERE task_id = $1 AND id = ANY($2::text[])`,
          [taskId, evidenceIds]
        )
      : [];
  const twitterPostDetail =
    evidences
      .filter((evidence) => evidence.evidence_type === "twitter_post_detail")
      .map((evidence) => parseJsonObject<TwitterPostDetailPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const twitterAssessment =
    evidences
      .filter((evidence) => evidence.evidence_type === "twitter_page_assessment")
      .map((evidence) => parseJsonObject<TwitterAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityWindowSummary =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_window_summary")
      .map((evidence) => parseJsonObject<CommunityWindowSummaryPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityStructureMetrics =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_structure_metrics")
      .map((evidence) => parseJsonObject<CommunityStructureMetricsPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;
  const communityQualityAssessment =
    evidences
      .filter((evidence) => evidence.evidence_type === "community_quality_assessment")
      .map((evidence) => parseJsonObject<CommunityQualityAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  return {
    factor: {
      ...factor,
      risk_points: parseJsonArray((factor as { risk_points_json?: string }).risk_points_json),
      opportunity_points: parseJsonArray((factor as { opportunity_points_json?: string }).opportunity_points_json),
      evidence_refs: evidenceIds
    },
    evidences,
    twitter_detail:
      twitterPostDetail || twitterAssessment
        ? {
            text: twitterPostDetail?.text ?? null,
            published_at: twitterPostDetail?.datetime ?? null,
            metrics: twitterPostDetail?.metrics ?? null,
            page_status: twitterAssessment?.pageStatus ?? null,
            status_reason: twitterAssessment?.statusReason ?? null,
            tweet_quality_score: twitterAssessment?.tweetQualityScore ?? null,
            comment_quality_score: twitterAssessment?.commentQualityScore ?? null,
            visible_reply_count: twitterAssessment?.replyCount ?? null
          }
        : null,
    community_detail:
      communityWindowSummary || communityStructureMetrics || communityQualityAssessment
        ? {
            window_summary: communityWindowSummary ?? null,
            structure_metrics: communityStructureMetrics ?? null,
            quality_assessment: communityQualityAssessment ?? null
          }
        : null,
    reviews
  };
};

export const getFinalAnalysisReportPg = async (db: AppDbClient, taskId: string) => {
  const project = await db.one<{ name: string }>(
    `SELECT p.name FROM projects p JOIN analysis_tasks t ON t.project_id = p.id WHERE t.id = $1`,
    [taskId]
  );
  const report = await db.one<ReportRow>(
    `SELECT final_score, risk_level, summary, data_quality_note FROM reports WHERE task_id = $1`,
    [taskId]
  );
  if (!project || !report) return null;

  const [dimensions, factors, reviews, versions] = await Promise.all([
    db.query<DimensionRow>(
      `SELECT dimension_key, dimension_name, final_score, summary
       FROM dimensions WHERE task_id = $1 ORDER BY final_score ASC, dimension_name ASC`,
      [taskId]
    ),
    db.query<FactorRow>(
      `SELECT id, factor_key, factor_name, dimension_key, dimension_name, status, final_score, score_reason,
              risk_points_json, opportunity_points_json, evidence_refs_json
       FROM factors WHERE task_id = $1 ORDER BY final_score ASC, factor_name ASC`,
      [taskId]
    ),
    db.one<{ count: number }>(`SELECT COUNT(*)::int as count FROM review_records WHERE task_id = $1`, [taskId]),
    db.query<VersionMeta>(`SELECT id, version_type, created_at FROM report_versions WHERE task_id = $1 ORDER BY created_at DESC`, [taskId])
  ]);

  const evidenceIds = Array.from(new Set(factors.flatMap((factor) => parseJsonArray(factor.evidence_refs_json))));
  const evidences =
    evidenceIds.length > 0
      ? await db.query<EvidenceRow>(
          `SELECT id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at
           FROM evidences WHERE task_id = $1 AND id = ANY($2::text[])`,
          [taskId, evidenceIds]
        )
      : [];

  const latestVersion = pickLatestVersion(versions);
  const weakestDimensions = dimensions.slice(0, 3);
  const strongestDimensions = [...dimensions].sort((a, b) => b.final_score - a.final_score).slice(0, 2);
  const keyProblemFactors = factors.filter((factor) => (factor.final_score ?? 0) < 5).slice(0, 5);
  const topProblems = keyProblemFactors.slice(0, 3).map((factor) => ({
    factor_key: factor.factor_key,
    factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
    statement: `${FACTOR_LABELS[factor.factor_key] ?? factor.factor_name}偏弱，${factorImpactText(factor)}`,
    supporting_reason: cleanReason(factor.score_reason)
  }));
  const positiveSignals = [...factors]
    .filter((factor) => (factor.final_score ?? 0) >= 7)
    .slice(0, 2)
    .map((factor) => ({
      factor_key: factor.factor_key,
      factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
      statement: `${FACTOR_LABELS[factor.factor_key] ?? factor.factor_name}当前表现相对稳定。`
    }));
  const evidenceGroups = Object.entries(
    evidences.reduce<Record<string, EvidenceRow[]>>((acc, evidence) => {
      const group = SOURCE_GROUP_LABELS[evidence.evidence_type] ?? "其他";
      acc[group] ??= [];
      acc[group].push(evidence);
      return acc;
    }, {})
  ).map(([sourceGroup, items]) => ({
    source_group: sourceGroup,
    items: items.slice(0, 3).map((item) => ({
      evidence_type: item.evidence_type,
      title: item.title ?? "未命名证据",
      summary: item.summary ?? "暂无摘要。",
      credibility_level: item.credibility_level,
      captured_at: item.captured_at
    }))
  }));

  const contentDomainOverview = buildContentDomainOverview(evidences);

  return {
    meta: {
      task_id: taskId,
      project_name: project.name,
      report_version_type: latestVersion?.version_type ?? "live_current",
      report_version_created_at: latestVersion?.created_at ?? null,
      review_count: reviews?.count ?? 0
    },
    execution_summary: {
      headline: overallJudgement(report.risk_level),
      final_score: report.final_score,
      risk_level: report.risk_level,
      risk_level_label: RISK_LEVEL_LABELS[report.risk_level] ?? report.risk_level,
      top_problems: topProblems,
      positive_signals: positiveSignals
    },
    overall_assessment: {
      conclusion: report.summary,
      data_quality_note: report.data_quality_note,
      recommended_decision: DECISION_LABELS[report.risk_level] ?? "建议继续复核"
    },
    dimension_overview: {
      items: dimensions.map((dimension) => ({
        dimension_key: dimension.dimension_key,
        dimension_name: DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name,
        final_score: dimension.final_score,
        summary: dimension.summary,
        judgement: summarizeDimension(dimension.final_score)
      }))
    },
    key_issues: {
      items: keyProblemFactors.map((factor) => ({
        factor_key: factor.factor_key,
        factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
        final_score: factor.final_score,
        issue_statement: cleanReason(factor.score_reason),
        business_impact: factorImpactText(factor),
        risk_points: parseJsonArray(factor.risk_points_json)
      }))
    },
    key_evidence: {
      groups: evidenceGroups
    },
    conclusion_and_next_step: {
      conclusion: conclusionText(report.risk_level),
      priority_review_areas: weakestDimensions.map((dimension) => DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name),
      retained_strengths: strongestDimensions.map((dimension) => DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name),
      strategy_entry_note: "本报告完成分析层收口，完整运营策略应在策略层单独生成。"
    }
  };
};
