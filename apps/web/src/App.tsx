import { useEffect, useState } from "react";

type TaskSummary = {
  id: string;
  project_name: string;
  final_score: number | null;
  review_status: string;
  risk_level: string | null;
};

type TaskSnapshot = {
  project: { name: string };
  summary: {
    evidenceCount: number;
    factorCount: number;
    versionCount: number;
  };
  factors: Array<{
    id: string;
    factor_name: string;
    dimension_name: string;
    final_score: number;
    status: string;
    confidence_level: string;
  }>;
  versions: Array<{
    id: string;
    version_type: string;
    created_at: string;
  }>;
};

type ReportView = {
  report: {
    final_score: number;
    risk_level: string;
    summary: string;
    data_quality_note: string;
  } | null;
  dimensions: Array<{
    dimension_key: string;
    dimension_name: string;
    final_score: number;
  }>;
};

type FinalAnalysisReport = {
  meta: {
    task_id: string;
    project_name: string;
    report_version_type: string;
    report_version_created_at: string | null;
    review_count: number;
  };
  execution_summary: {
    headline: string;
    final_score: number;
    risk_level: string;
    risk_level_label: string;
    top_problems: Array<{
      factor_key: string;
      factor_name: string;
      statement: string;
      supporting_reason: string;
    }>;
    positive_signals: Array<{
      factor_key: string;
      factor_name: string;
      statement: string;
    }>;
  };
  overall_assessment: {
    conclusion: string;
    data_quality_note: string;
    recommended_decision: string;
    content_domain_overview?: {
      website_page_count: number;
      docs_page_count: number;
      whitepaper_section_count: number;
      total_characters: number;
      sample_topics: string[];
      note: string;
    } | null;
  };
  dimension_overview: {
    items: Array<{
      dimension_key: string;
      dimension_name: string;
      final_score: number;
      summary: string;
      judgement: string;
    }>;
  };
  key_issues: {
    items: Array<{
      factor_key: string;
      factor_name: string;
      final_score: number | null;
      issue_statement: string;
      business_impact: string;
      risk_points: string[];
    }>;
  };
  key_evidence: {
    groups: Array<{
      source_group: string;
      items: Array<{
        evidence_type: string;
        title: string;
        summary: string;
        credibility_level: string;
        captured_at: string;
      }>;
    }>;
    content_domain_snapshot?: {
      website_page_count: number;
      docs_page_count: number;
      whitepaper_section_count: number;
      total_characters: number;
      sample_topics: string[];
      note: string;
    } | null;
  };
  conclusion_and_next_step: {
    conclusion: string;
    priority_review_areas: string[];
    retained_strengths: string[];
    strategy_entry_note: string;
  };
};

type CollectionActionResult = {
  warnings: string[];
  evidenceCount: number;
  collectedSources: string[];
  skippedSources: string[];
};

type TaskSource = {
  id: string;
  source_type: string;
  source_url: string;
  is_official: number;
  access_status: string;
  evidence_count: number;
  chain_key?: string | null;
  chain_label?: string | null;
  contract_role_hint?: string | null;
};

type CollectionRun = {
  id: string;
  collector_key: string;
  source_type: string;
  status: string;
  collected_count: number;
  skipped_count: number;
  evidence_count: number;
  warnings: string[];
  created_at: string;
};

type SourceDetail = {
  source: TaskSource & {
    created_at: string;
    updated_at: string;
  };
  communityContext: {
    platform: string;
    target_label: string | null;
    target_kind: string | null;
    requested_window_hours: number;
    effective_window_hours: number | null;
    history_access_mode: string;
    bot_access_status: string;
    created_at: string;
    updated_at: string;
  } | null;
  onchainContext: {
    chainKey: string;
    chainLabel: string;
    contractRoleHint: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  communityDetail: {
    windowSummary: {
      requestedWindowHours: number | null;
      effectiveWindowHours: number | null;
      messageCount: number | null;
      speakerCount: number | null;
      historyAccessMode: string | null;
      botAccessStatus: string | null;
    } | null;
    structureMetrics: {
      activity: {
        topSpeakersShare?: number | null;
        averageMessagesPerSpeaker?: number | null;
        burstinessScore?: number | null;
      } | null;
      repetition: {
        duplicateMessageRatio?: number | null;
        shortMessageRatio?: number | null;
        templateSignalRatio?: number | null;
        lowSignalRatio?: number | null;
      } | null;
      discussion: {
        projectRelevantRatio?: number | null;
        qaInteractionRatio?: number | null;
        offTopicRatio?: number | null;
      } | null;
    } | null;
    messageSamples: Array<{
      evidenceId: string;
      title: string | null;
      summary: string | null;
      bucket: string | null;
      itemCount: number | null;
      sampleMessages: Array<{
        author?: string | null;
        text?: string | null;
        sentAt?: string | null;
      }>;
    }>;
    qualityAssessment: {
      overallStatus: string | null;
      activityQualityScore: number | null;
      discussionEffectivenessScore: number | null;
      participationDepthScore: number | null;
      botRiskScore: number | null;
      keyFindings: string[];
    } | null;
  } | null;
  evidences: Array<{
    id: string;
    evidence_type: string;
    title: string | null;
    summary: string | null;
    credibility_level: string;
    captured_at: string;
  }>;
  twitterDetail: {
    pageStatus: string | null;
    statusReason: string | null;
    tweetQualityScore: number | null;
    commentQualityScore: number | null;
    visibleReplyCount: number | null;
    text: string | null;
    publishedAt: string | null;
    metrics: {
      replies: number | null;
      reposts: number | null;
      likes: number | null;
      bookmarks: number | null;
      views: number | null;
    } | null;
  } | null;
  onchainDetail: {
    chainLabel: string | null;
    contractRoleHint: string | null;
    latestBlock: string | null;
    balance: string | null;
    hasCode: boolean | null;
    contractProfile: {
      detectedInterfaces: string[];
      tokenMetadata: {
        name: string | null;
        symbol: string | null;
        decimals: string | null;
        totalSupply: string | null;
      };
      ownership: {
        owner: string | null;
      };
      proxy: {
        implementationAddress: string | null;
      };
    } | null;
    roleAssessment: {
      roleGuess: string | null;
      confidence: "low" | "medium" | "high" | null;
      reason: string | null;
      nextStepHint: string | null;
      analysisMode: "remote_llm" | "rule_fallback" | null;
    } | null;
    codeFeatures: {
      bytecodeLength: number | null;
      selectorCount: number | null;
      detectedFeatures: string[];
      matchedSelectors: string[];
      codeShape: "standard_like" | "standard_extended" | "non_standard" | null;
      complexityHint: "low" | "medium" | "high" | null;
      featureReason: string | null;
      boundaryNote: string | null;
    } | null;
    lpCandidates: Array<{
      id: string;
      dexLabel: string;
      quoteTokenLabel: string;
      lpAddress: string;
      confidence: string;
      rationale: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  } | null;
  relatedRuns: CollectionRun[];
};

type FactorDetail = {
  factor: {
    factor_name: string;
    score_reason: string;
    confidence_level: string;
    risk_points: string[];
    opportunity_points: string[];
  };
  twitter_detail: {
    page_status: string | null;
    tweet_quality_score: number | null;
    comment_quality_score: number | null;
    visible_reply_count: number | null;
    published_at: string | null;
    metrics: {
      replies: number | null;
      reposts: number | null;
      likes: number | null;
      bookmarks: number | null;
      views: number | null;
    } | null;
  } | null;
  community_detail: {
    window_summary: {
      requested_window_hours: number | null;
      effective_window_hours: number | null;
      message_count: number | null;
      speaker_count: number | null;
      history_access_mode: string | null;
      bot_access_status: string | null;
    } | null;
    structure_metrics: {
      activity: {
        topSpeakersShare?: number | null;
        averageMessagesPerSpeaker?: number | null;
        burstinessScore?: number | null;
      } | null;
      repetition: {
        duplicateMessageRatio?: number | null;
        shortMessageRatio?: number | null;
        templateSignalRatio?: number | null;
        lowSignalRatio?: number | null;
      } | null;
      discussion: {
        projectRelevantRatio?: number | null;
        qaInteractionRatio?: number | null;
        offTopicRatio?: number | null;
      } | null;
    } | null;
    quality_assessment: {
      overall_status: string | null;
      activity_quality_score: number | null;
      discussion_effectiveness_score: number | null;
      participation_depth_score: number | null;
      bot_risk_score: number | null;
      key_findings: string[];
    } | null;
  } | null;
  evidences: Array<{
    id: string;
    evidence_type: string;
    title: string | null;
    summary: string | null;
    insight_summary?: string | null;
  }>;
};

type VersionDetail = {
  report_snapshot: {
    summary: string;
  } | null;
  dimension_snapshot: Array<{
    dimension_name: string;
    final_score: number;
  }>;
};

const TASK_HIERARCHY = {
  level1: "产品基本面评估",
  level2: [
    {
      name: "产品成熟度",
      factors: ["官网完成度", "白皮书深度", "产品核心功能可用性", "链上产品落地性"]
    },
    {
      name: "社区与用户健康度",
      factors: ["Twitter 内容质量", "社区活跃质量", "有效用户迹象", "用户购买力迹象"]
    },
    {
      name: "Bot 风险",
      factors: ["Twitter 异常互动迹象", "社区机械回复迹象", "用户结构异常迹象"]
    },
    {
      name: "增长潜力",
      factors: ["叙事与市场方向匹配度", "当前活动与产品匹配度", "区域结构匹配度"]
    },
    {
      name: "交叉验证可信度",
      factors: ["项目说法与白皮书一致性", "白皮书与链上表现一致性", "社区体量与链上体量一致性"]
    },
    {
      name: "综合风险等级",
      factors: ["时间窗口风险", "团队规模风险", "预算风险"]
    }
  ]
};

const normalizeFactorName = (value: string) =>
  value
    .replace(/\s+/g, "")
    .replace("官网完成度", "官网完整度")
    .replace("有效用户迹象", "有效用户信号")
    .replace("用户购买力迹象", "用户购买力信号")
    .replace("链上产品落地性", "链上产品落地信号")
    .replace("Twitter异常互动迹象", "Twitter异常互动信号")
    .replace("社区机械回复迹象", "社区Bot/模板化信号")
    .replace("用户结构异常迹象", "用户结构异常信号")
    .replace("社区体量与链上体量一致性", "社区与链上表现一致性")
    .trim();

const scoreTone = (score: number | null) => {
  if (score === null) return "tone-neutral";
  if (score < 4) return "tone-risk";
  if (score < 7) return "tone-warn";
  return "tone-good";
};

const sourceStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    completed: "采集完成",
    partial: "部分采集",
    failed: "采集失败",
    pending: "等待采集"
  };
  return labels[status ?? ""] ?? "状态未知";
};

const twitterPageStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    valid_tweet: "推文页面有效",
    weak_capture: "已获取部分内容",
    blocked_wall: "命中登录拦截",
    profile_or_unknown: "页面识别不足"
  };
  return labels[status ?? ""] ?? "未识别";
};

const sourceTypeLabel = (sourceType?: string | null) => {
  const labels: Record<string, string> = {
    website: "官网来源",
    docs: "文档来源",
    whitepaper: "白皮书来源",
    twitter: "Twitter 来源",
    telegram: "Telegram 社区",
    discord: "Discord 社区",
    contract: "合约地址"
  };
  return labels[sourceType ?? ""] ?? sourceType ?? "未知来源";
};

const evidenceTypeLabel = (evidenceType?: string | null) => {
  const labels: Record<string, string> = {
    website_page: "官网内容",
    docs_page: "文档内容",
    whitepaper_page: "白皮书内容",
    twitter_posts: "推文内容",
    twitter_post_detail: "推文详情",
    twitter_page_assessment: "页面评估",
    twitter_page_capture: "页面采集记录",
    twitter_profile: "账号资料",
    onchain_metric: "链上指标",
    onchain_contract_profile: "合约规则探测",
    onchain_code_features: "代码特征检测",
    onchain_role_assessment: "合约角色识别",
    community_window_summary: "社区窗口摘要",
    community_structure_metrics: "社区结构指标",
    community_message_sample: "社区消息样本",
    community_quality_assessment: "社区质量评估"
  };
  return labels[evidenceType ?? ""] ?? evidenceType ?? "未知证据";
};

const collectorLabel = (collectorKey?: string | null) => {
  const labels: Record<string, string> = {
    public_web_fetch: "公开网页采集",
    whitepaper_pdf_parse: "Whitepaper PDF 解析",
    onchain_rpc_provider: "链上 RPC 采集",
    twitter_public_fetch: "Twitter 公开回退采集",
    twitter_browser_fetch: "Twitter 浏览器采集",
    telegram_bot_ingestion: "Telegram 机器人采集",
    discord_bot_ingestion: "Discord 机器人采集"
  };
  return labels[collectorKey ?? ""] ?? collectorKey ?? "未知采集器";
};

const fileToBase64 = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

const confidenceLabel = (confidence?: string | null) => {
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低"
  };
  return labels[confidence ?? ""] ?? "未知";
};

const reviewStatusLabel = (reviewStatus?: string | null) => {
  const labels: Record<string, string> = {
    pending_review: "待复核",
    reviewed: "已复核",
    not_started: "未复核"
  };
  return labels[reviewStatus ?? ""] ?? reviewStatus ?? "未知";
};

const botAccessStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    pending_bot_access: "待接入机器人",
    bot_present: "机器人已在群内",
    bot_missing_permissions: "机器人权限不足",
    bot_ready: "机器人可采集"
  };
  return labels[status ?? ""] ?? status ?? "未知";
};

const historyAccessModeLabel = (mode?: string | null) => {
  const labels: Record<string, string> = {
    historical_read: "可读取历史消息",
    live_only: "仅可监听新消息",
    partial_history: "仅可读取部分历史",
    unknown: "历史读取能力待确认"
  };
  return labels[mode ?? ""] ?? mode ?? "未知";
};

const communityBucketLabel = (bucket?: string | null) => {
  const labels: Record<string, string> = {
    repeated_messages: "高重复样本",
    project_relevant: "项目相关样本",
    qa_interactions: "问答互动样本",
    baseline_random: "常规活跃样本",
    anomaly_patterns: "异常模式样本"
  };
  return labels[bucket ?? ""] ?? bucket ?? "样本分桶";
};

const communityOverallStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    healthy: "整体健康",
    moderate: "整体一般",
    abnormal: "存在异常",
    high_risk: "高风险"
  };
  return labels[status ?? ""] ?? status ?? "待评估";
};

const onchainReadinessLabel = (hasCode?: boolean | null) => {
  if (hasCode === true) return "已确认为链上合约";
  if (hasCode === false) return "当前未识别到合约代码";
  return "基础链上识别尚未完成";
};

const onchainBalanceLabel = (balance?: string | null) => {
  if (!balance || balance === "unknown") return "暂未读取";
  return balance;
};

const onchainL1Summary = (detail?: SourceDetail["onchainDetail"] | null) => {
  if (!detail) {
    return "当前来源还没有进入链上基础识别。";
  }

  if (detail.hasCode === true) {
    return "当前已完成链上 L1 基础识别：已确认这是链上合约，并完成了基础可读性检查。";
  }

  if (detail.hasCode === false) {
    return "当前已完成链上 L1 基础识别，但没有读取到合约代码，需复核链、地址或 RPC 配置是否匹配。";
  }

  return "当前仅建立了链上目标上下文，尚未形成有效的链上基础识别结果。";
};

const onchainL1BoundaryText =
  "这一层只负责确认“它是不是合约、它在哪条链、基础读取是否正常、是否有原生币余额”，暂不判断合约角色、资金流或项目级链上画像。";

const onchainRoleConfidenceLabel = (value?: "low" | "medium" | "high" | null) => {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return "--";
};

const onchainAnalysisModeLabel = (value?: "remote_llm" | "rule_fallback" | null) => {
  if (value === "remote_llm") return "规则识别 + LLM 归纳";
  if (value === "rule_fallback") return "规则识别回退";
  return "未识别";
};

const onchainCodeShapeLabel = (value?: "standard_like" | "standard_extended" | "non_standard" | null) => {
  if (value === "standard_like") return "标准型";
  if (value === "standard_extended") return "标准扩展型";
  if (value === "non_standard") return "非标准型";
  return "--";
};

const lpCandidateStatusLabel = (value?: string | null) => {
  if (value === "confirmed") return "已确认";
  if (value === "ignored") return "已忽略";
  if (value === "pending") return "待确认";
  return "未知";
};

const CHAIN_OPTIONS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bsc", label: "BNB Chain" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "polygon", label: "Polygon" },
  { value: "optimism", label: "Optimism" },
  { value: "avalanche", label: "Avalanche C-Chain" }
] as const;

const versionTypeLabel = (value?: string | null) => {
  const labels: Record<string, string> = {
    ai_initial: "AI 初版",
    human_revised: "人工修正版",
    final_confirmed: "最终确认版",
    live_current: "当前实时版"
  };
  return labels[value ?? ""] ?? value ?? "未知版本";
};

const formatMetric = (value?: number | null) => {
  if (value === null || value === undefined) return "--";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
};

const formatRatio = (value?: number | null) => {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(1)}%`;
};

const groupFactorEvidencesBySource = (evidences: FactorDetail["evidences"]) => {
  const definitions = [
    {
      key: "twitter-content",
      title: "推文主体",
      test: (evidence: FactorDetail["evidences"][number]) => ["twitter_posts", "twitter_post_detail"].includes(evidence.evidence_type)
    },
    {
      key: "twitter-assessment",
      title: "页面评估与互动指标",
      test: (evidence: FactorDetail["evidences"][number]) => ["twitter_page_assessment", "twitter_page_capture"].includes(evidence.evidence_type)
    },
    {
      key: "web-docs",
      title: "官网与文档",
      test: (evidence: FactorDetail["evidences"][number]) => ["website_page", "docs_page", "whitepaper_page"].includes(evidence.evidence_type)
    },
    {
      key: "onchain",
      title: "链上指标",
      test: (evidence: FactorDetail["evidences"][number]) => evidence.evidence_type === "onchain_metric"
    },
    {
      key: "community",
      title: "社区信号",
      test: (evidence: FactorDetail["evidences"][number]) =>
        ["community_window_summary", "community_structure_metrics", "community_message_sample", "community_quality_assessment"].includes(
          evidence.evidence_type
        )
    }
  ];

  const usedIds = new Set<string>();
  const groups = definitions
    .map((definition) => {
      const items = evidences.filter((evidence) => {
        const matched = definition.test(evidence);
        if (matched) usedIds.add(evidence.id);
        return matched;
      });
      return { key: definition.key, title: definition.title, items };
    })
    .filter((group) => group.items.length > 0);

  const otherItems = evidences.filter((evidence) => !usedIds.has(evidence.id));
  if (otherItems.length > 0) {
    groups.push({ key: "other", title: "其他证据", items: otherItems });
  }

  return groups;
};

export default function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [report, setReport] = useState<ReportView | null>(null);
  const [finalReport, setFinalReport] = useState<FinalAnalysisReport | null>(null);
  const [sources, setSources] = useState<TaskSource[]>([]);
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [factorDetail, setFactorDetail] = useState<FactorDetail | null>(null);
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [reviewer, setReviewer] = useState("operator");
  const [overrideScore, setOverrideScore] = useState("7.5");
  const [overrideReason, setOverrideReason] = useState("Manual review adjustment");
  const [factSupplement, setFactSupplement] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [lastCollectionResult, setLastCollectionResult] = useState<CollectionActionResult | null>(null);
  const [freshlyCollectedTaskIds, setFreshlyCollectedTaskIds] = useState<Set<string>>(new Set());
  const [twitterQueueAtByTask, setTwitterQueueAtByTask] = useState<Record<string, string>>({});
  const [activeActionPath, setActiveActionPath] = useState<string | null>(null);
  const [websiteInput, setWebsiteInput] = useState("https://docs.python.org/3/");
  const [docsInput, setDocsInput] = useState("https://nodejs.org/api/documentation.html");
  const [whitepaperFile, setWhitepaperFile] = useState<File | null>(null);
  const [whitepaperInputKey, setWhitepaperInputKey] = useState(0);
  const [twitterInput, setTwitterInput] = useState("https://twitter.com/OpenAI/status/1900000000000000001");
  const [telegramInput, setTelegramInput] = useState("");
  const [discordInput, setDiscordInput] = useState("");
  const [chainInput, setChainInput] = useState<(typeof CHAIN_OPTIONS)[number]["value"]>("ethereum");
  const [contractInput, setContractInput] = useState("");
  const [notesInput, setNotesInput] = useState("new task from web intake");
  const [activeHierarchyLevel, setActiveHierarchyLevel] = useState<"level2" | "level3">("level2");
  const [selectedDimensionName, setSelectedDimensionName] = useState<string>(TASK_HIERARCHY.level2[0]?.name ?? "");
  const [level1Expanded, setLevel1Expanded] = useState(true);
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set(TASK_HIERARCHY.level2.map((item) => item.name)));
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    return (await response.json()) as T;
  };

  const fetchJsonOrNull = async <T,>(url: string): Promise<T | null> => {
    const response = await fetch(url);
    if (response.status === 404) {
      return null;
    }
    return (await response.json()) as T;
  };

  const normalizeCollectionResult = (payload: Record<string, unknown>): CollectionActionResult => ({
    warnings: Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [],
    evidenceCount: typeof payload.evidenceCount === "number" ? payload.evidenceCount : 0,
    collectedSources: Array.isArray(payload.collectedSources)
      ? (payload.collectedSources as string[])
      : Array.isArray(payload.collectedContracts)
        ? (payload.collectedContracts as string[])
        : [],
    skippedSources: Array.isArray(payload.skippedSources)
      ? (payload.skippedSources as string[])
      : Array.isArray(payload.skippedContracts)
        ? (payload.skippedContracts as string[])
        : []
  });

  const refreshTasks = async (options?: { loadHistory?: boolean }) => {
    const payload = await fetchJson<{ items: TaskSummary[] }>("/tasks");
    setTasks(payload.items);
    if (options?.loadHistory) {
      setHistoryLoaded(true);
    }
    setSelectedTaskId((current) =>
      current && payload.items.some((item) => item.id === current) ? current : null
    );
  };

  const refreshSelectedTask = async (taskId: string) => {
    const [snapshotPayload, reportPayload, finalReportPayload, sourcesPayload, runsPayload] = (await Promise.all([
      fetchJson<TaskSnapshot>(`/tasks/${taskId}`),
      fetchJsonOrNull<ReportView>(`/tasks/${taskId}/report`),
      fetchJsonOrNull<FinalAnalysisReport>(`/tasks/${taskId}/final-analysis-report`),
      fetchJson<{ items: TaskSource[] }>(`/tasks/${taskId}/sources`),
      fetchJson<{ items: CollectionRun[] }>(`/tasks/${taskId}/collection-runs`)
    ])) as [TaskSnapshot, ReportView | null, FinalAnalysisReport | null, { items: TaskSource[] }, { items: CollectionRun[] }];

    setSnapshot(snapshotPayload);
    setReport(reportPayload);
    setFinalReport(finalReportPayload);
    setSources(sourcesPayload.items);
    setRuns(runsPayload.items);
    const queuedAt = twitterQueueAtByTask[taskId];
    if (queuedAt) {
      const queuedAtMs = new Date(queuedAt).getTime();
      const hasTwitterRunAfterQueue = runsPayload.items.some((run) =>
        run.collector_key === "twitter_browser_fetch" &&
        ["completed", "partial", "failed"].includes(run.status) &&
        new Date(run.created_at).getTime() >= queuedAtMs
      );
      if (hasTwitterRunAfterQueue) {
        setTwitterQueueAtByTask((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
      }
    }
    setSelectedFactorId((current) =>
      snapshotPayload.factors.some((factor) => factor.id === current) ? (current ?? null) : (snapshotPayload.factors[0]?.id ?? null)
    );
    setSelectedVersionId((current) =>
      snapshotPayload.versions.some((version) => version.id === current) ? (current ?? null) : (snapshotPayload.versions[0]?.id ?? null)
    );
    setSelectedSourceId((current) =>
      sourcesPayload.items.some((source) => source.id === current) ? (current ?? null) : (sourcesPayload.items[0]?.id ?? null)
    );
  };

  useEffect(() => {
    if (!selectedTaskId) return;
    void refreshSelectedTask(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId || !selectedFactorId) {
      setFactorDetail(null);
      return;
    }
    void fetchJsonOrNull<FactorDetail>(`/tasks/${selectedTaskId}/factors/${selectedFactorId}`).then((payload) => setFactorDetail(payload));
  }, [selectedTaskId, selectedFactorId]);

  useEffect(() => {
    if (!selectedTaskId || !selectedSourceId) {
      setSourceDetail(null);
      return;
    }
    void fetchJsonOrNull<SourceDetail>(`/tasks/${selectedTaskId}/sources/${selectedSourceId}`).then((payload) => setSourceDetail(payload));
  }, [selectedTaskId, selectedSourceId]);

  useEffect(() => {
    if (!selectedTaskId || !selectedVersionId) {
      setVersionDetail(null);
      return;
    }
    void fetchJsonOrNull<VersionDetail>(`/tasks/${selectedTaskId}/versions/${selectedVersionId}`).then((payload) => setVersionDetail(payload));
  }, [selectedTaskId, selectedVersionId]);

  const runAction = async (label: string, path: string) => {
    if (!selectedTaskId) return;
    if (path === "analyze-factors" && !freshlyCollectedTaskIds.has(selectedTaskId)) {
      setActionState("请先对当前任务执行至少一次采集，再运行分析，避免直接使用历史数据。");
      return;
    }
    setActiveActionPath(path);
    setActionState(label);
    try {
      const response = await fetch(`/tasks/${selectedTaskId}/${path}`, { method: "POST" });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof result.message === "string" ? result.message : typeof result.error === "string" ? result.error : "unknown_error");
      }
      if (path === "collect-twitter-browser") {
        // Queueing is async; avoid keeping a persistent warning card that looks like an error.
        setLastCollectionResult(null);
        setTwitterQueueAtByTask((current) => ({ ...current, [selectedTaskId]: new Date().toISOString() }));
      } else if (path !== "analyze-factors") {
        setLastCollectionResult(normalizeCollectionResult(result));
      }
      if (path !== "analyze-factors") {
        setFreshlyCollectedTaskIds((current) => {
          const next = new Set(current);
          next.add(selectedTaskId);
          return next;
        });
      }
      await refreshSelectedTask(selectedTaskId);
      await refreshTasks();
      if (path === "collect-twitter-browser") {
        setActionState("Twitter 浏览器采集任务已入队，Worker 正在异步处理。请稍后刷新采集记录。");
      } else {
        setActionState(`${label.replace("正在", "").replace("...", "")}已刷新。`);
      }
    } catch (error) {
      setActionState(`${label.replace("正在", "").replace("...", "")}失败：${error instanceof Error ? error.message : "unknown_error"}`);
    } finally {
      setActiveActionPath(null);
    }
  };

  const handleReviewFactor = async () => {
    if (!selectedTaskId || !selectedFactorId) return;
    setActionState("正在提交人工复核...");
    await fetch(`/tasks/${selectedTaskId}/review-factor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId: selectedFactorId, reviewer, overrideScore: Number(overrideScore), factSupplement, overrideReason })
    });
    await refreshSelectedTask(selectedTaskId);
    await refreshTasks();
    setActionState("人工复核已生效。");
  };

  const handleDiscoverLpCandidates = async () => {
    if (!selectedTaskId || !selectedSourceId) return;
    setActionState("正在检索相关 LP 候选...");
    const response = await fetch(`/tasks/${selectedTaskId}/sources/${selectedSourceId}/discover-lp-candidates`, {
      method: "POST"
    });
    const payload = (await response.json()) as { warnings?: string[]; candidates?: Array<{ lpAddress: string }> };
    setLastCollectionResult({
      warnings: payload.warnings ?? [],
      evidenceCount: 0,
      collectedSources: (payload.candidates ?? []).map((item) => item.lpAddress),
      skippedSources: []
    });
    await refreshSelectedTask(selectedTaskId);
    setActionState("LP 候选已刷新。");
  };

  const handleLpCandidateAction = async (candidateId: string, action: "confirm" | "ignore") => {
    if (!selectedTaskId) return;
    setActionState(action === "confirm" ? "正在确认 LP 候选..." : "正在忽略 LP 候选...");
    await fetch(`/tasks/${selectedTaskId}/lp-candidates/${candidateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    await refreshSelectedTask(selectedTaskId);
    await refreshTasks();
    setActionState(action === "confirm" ? "LP 候选已确认。" : "LP 候选已忽略。");
  };

  const handleCreateTask = async () => {
    if (isCreatingTask) {
      return;
    }

    setIsCreatingTask(true);
    try {
      setActionState("正在创建分析任务...");
      const payload = {
        disableDedupe: true,
        inputs: [
          { type: "url", value: websiteInput },
          { type: "url", value: docsInput },
          { type: "url", value: twitterInput },
          { type: "url", value: telegramInput },
          { type: "url", value: discordInput },
          { type: "text", value: `chain:${chainInput}` },
          ...contractInput
            .split(/\r?\n|,/)
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => ({ type: "contract" as const, value })),
          { type: "text", value: notesInput }
        ].filter((item) => item.value.trim())
      };
      const created = (await fetch("/tasks/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json())) as {
        taskId: string;
        deduped?: boolean;
        dedupeWindowMinutes?: number;
      };

      if (whitepaperFile) {
        setActionState("正在上传 Whitepaper PDF...");
        const contentBase64 = await fileToBase64(whitepaperFile);
        const uploadResponse = await fetch(`/tasks/${created.taskId}/upload-whitepaper-document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: whitepaperFile.name,
            mimeType: whitepaperFile.type || "application/pdf",
            contentBase64
          })
        });
        if (!uploadResponse.ok) {
          const message = await uploadResponse.text();
          throw new Error(`whitepaper_upload_failed:${message}`);
        }
        setWhitepaperFile(null);
        setWhitepaperInputKey((current) => current + 1);
      }

      await refreshTasks();
      setSelectedTaskId(created.taskId);
      setActionState(
        [
          created.deduped
            ? `命中防重复规则：已复用最近 ${created.dedupeWindowMinutes ?? 10} 分钟内同名任务。`
            : "新任务已创建。",
          whitepaperFile ? `已附加 Whitepaper PDF：${whitepaperFile.name}。` : null
        ]
          .filter(Boolean)
          .join(" ")
      );
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const confirmed = window.confirm("删除后该任务的分析结果、证据、报告、复核和版本记录都会一并移除。确认删除吗？");
    if (!confirmed) {
      return;
    }

    setActionState("正在删除任务...");
    await fetch(`/tasks/${taskId}`, { method: "DELETE" });
    const payload = await fetchJson<{ items: TaskSummary[] }>("/tasks");
    setTasks(payload.items);

    if (selectedTaskId === taskId) {
      setSelectedTaskId(payload.items[0]?.id ?? null);
      if (payload.items.length === 0) {
        setSnapshot(null);
        setReport(null);
        setFinalReport(null);
        setSources([]);
        setRuns([]);
        setSelectedFactorId(null);
        setSelectedSourceId(null);
        setSelectedVersionId(null);
        setFactorDetail(null);
        setSourceDetail(null);
        setVersionDetail(null);
      }
    }

    setActionState("任务已删除。");
  };

  const handleSelectDimension = (dimensionName: string) => {
    setActiveHierarchyLevel("level2");
    setSelectedDimensionName(dimensionName);
    const factor = snapshot?.factors.find((item) => item.dimension_name === dimensionName);
    if (factor) {
      setSelectedFactorId(factor.id);
    }
  };

  const handleSelectFactor = (dimensionName: string, factorName: string) => {
    setActiveHierarchyLevel("level3");
    const candidates = (snapshot?.factors ?? []).filter((item) => item.dimension_name === dimensionName);
    const factor =
      candidates.find((item) => normalizeFactorName(item.factor_name) === normalizeFactorName(factorName)) ??
      candidates[0] ??
      null;
    if (factor) {
      setSelectedDimensionName(factor.dimension_name);
      setSelectedFactorId(factor.id);
    }
  };

  const selectedFactor = snapshot?.factors.find((item) => item.id === selectedFactorId) ?? null;
  const selectedDimensionFactors = (snapshot?.factors ?? []).filter((item) => item.dimension_name === selectedDimensionName);
  const selectableTasks = historyLoaded ? tasks : selectedTask ? [selectedTask] : [];
  const allExpanded = level1Expanded && expandedDimensions.size === TASK_HIERARCHY.level2.length;
  const hasTask = Boolean(selectedTaskId);
  const hasFreshCollection = Boolean(selectedTaskId && freshlyCollectedTaskIds.has(selectedTaskId));
  const hasRunningCollectionRun = runs.some((run) => ["queued", "running"].includes(run.status));
  const isTwitterQueued = Boolean(selectedTaskId && twitterQueueAtByTask[selectedTaskId]);
  const collectionInProgress = (activeActionPath !== null && activeActionPath !== "analyze-factors") || hasRunningCollectionRun || isTwitterQueued;
  const canRunAnalysis = hasTask && hasFreshCollection && !collectionInProgress;
  const hasAnalysisResult = Boolean(finalReport || report?.report || (snapshot?.factors.length ?? 0) > 0);
  const canReview = hasTask && hasAnalysisResult && !collectionInProgress;
  const latestTwitterBrowserRun =
    runs
      .filter((run) => run.collector_key === "twitter_browser_fetch")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const twitterBrowserStatus = !hasTask
    ? null
    : isTwitterQueued || latestTwitterBrowserRun?.status === "queued"
      ? { tone: "pending", label: "已加入队列", detail: "后台 Worker 尚未开始抓取，通常会在几秒内接手。" }
      : latestTwitterBrowserRun?.status === "running"
        ? { tone: "pending", label: "抓取中", detail: "Twitter 浏览器采集正在运行，请稍候等待结果刷新。" }
        : latestTwitterBrowserRun?.status === "completed"
          ? { tone: "ok", label: "抓取完成", detail: "浏览器采集已完成，来源详情中可以查看内容和互动信号。" }
          : latestTwitterBrowserRun?.status === "partial"
            ? {
                tone: "warn",
                label: "部分完成",
                detail: latestTwitterBrowserRun.warnings[0] ?? "浏览器采集返回了部分结果，但内容质量仍有限。"
              }
            : latestTwitterBrowserRun?.status === "failed"
              ? {
                  tone: "warn",
                  label: "抓取失败",
                  detail: latestTwitterBrowserRun.warnings[0] ?? "浏览器采集未能产出有效结果。"
                }
              : null;

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!(isTwitterQueued || latestTwitterBrowserRun?.status === "running")) return;
    const timer = window.setInterval(() => {
      void refreshSelectedTask(selectedTaskId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedTaskId, isTwitterQueued, latestTwitterBrowserRun?.status]);

  const handleToggleDimension = (dimensionName: string) => {
    setExpandedDimensions((current) => {
      const next = new Set(current);
      if (next.has(dimensionName)) {
        next.delete(dimensionName);
      } else {
        next.add(dimensionName);
      }
      return next;
    });
  };

  const handleToggleAllHierarchy = () => {
    if (allExpanded) {
      setLevel1Expanded(false);
      setExpandedDimensions(new Set());
      return;
    }
    setLevel1Expanded(true);
    setExpandedDimensions(new Set(TASK_HIERARCHY.level2.map((item) => item.name)));
  };

  return (
    <main className="shell">
      <section className="rail">
        <div className="rail-header">
          <p className="eyebrow">Intelligence Console</p>
          <h1>Task Grid</h1>
        </div>

        <div className="intake-card">
          <p className="eyebrow">Task Stages</p>
          <div className="intake-field">
            <label>
              <span>Website</span>
              <input value={websiteInput} onChange={(event) => setWebsiteInput(event.target.value)} />
            </label>
          </div>
          <div className="intake-field">
            <label>
              <span>Docs / Whitepaper</span>
              <input value={docsInput} onChange={(event) => setDocsInput(event.target.value)} />
            </label>
          </div>
          <div className="intake-inline-action">
            <label className="file-picker">
              <span>Whitepaper PDF 文件</span>
              <input
                key={whitepaperInputKey}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setWhitepaperFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="muted">
              Docs / Whitepaper 支持填写 URL，也支持直接上传 PDF 文件。{whitepaperFile ? ` 当前已选择：${whitepaperFile.name}` : " 当前未选择文件。"}
            </p>
            <p className="muted">{selectedTaskId ? "已选中任务，可直接解析 Whitepaper PDF。" : "先创建或选中任务后，才能解析 Whitepaper PDF。"}</p>
          </div>
          <div className="intake-field">
            <label>
              <span>Twitter / X</span>
              <input value={twitterInput} onChange={(event) => setTwitterInput(event.target.value)} />
            </label>
          </div>
          <div className="intake-field">
            <label>
              <span>Telegram</span>
              <input value={telegramInput} onChange={(event) => setTelegramInput(event.target.value)} />
            </label>
          </div>
          <div className="intake-field">
            <label>
              <span>Discord</span>
              <input value={discordInput} onChange={(event) => setDiscordInput(event.target.value)} />
            </label>
          </div>
          <label>
            <span>Target Chain</span>
            <select value={chainInput} onChange={(event) => setChainInput(event.target.value as (typeof CHAIN_OPTIONS)[number]["value"])}>
              {CHAIN_OPTIONS.map((chain) => (
                <option key={chain.value} value={chain.value}>{chain.label}</option>
              ))}
            </select>
          </label>
          <div className="intake-field intake-field-area">
            <label>
              <span>Contracts</span>
              <textarea
                value={contractInput}
                onChange={(event) => setContractInput(event.target.value)}
                placeholder={"每行一个合约地址，支持多个"}
              />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea value={notesInput} onChange={(event) => setNotesInput(event.target.value)} />
          </label>

          <div className="stage-gate-board">
            <section className="stage-card">
              <p className="panel-tag">阶段 0 · 任务初始化</p>
              <p className="muted">先创建任务，再进入来源配置和采集阶段。</p>
              <div className="stage-actions">
                <button type="button" className="submit-review" onClick={handleCreateTask} disabled={isCreatingTask || collectionInProgress}>
                  {isCreatingTask ? "创建中..." : "创建任务"}
                </button>
                <button type="button" className="submit-review secondary-action" onClick={() => void refreshTasks({ loadHistory: true })}>
                  加载历史任务
                </button>
              </div>
            </section>

            <section className="stage-card">
              <p className="panel-tag">阶段 1 · 来源配置</p>
              <p className="muted">{hasTask ? "来源字段可编辑。修改后请先重新采集，再运行分析。" : "先创建或选择任务后再配置来源。"}</p>
            </section>

            <section className="stage-card">
              <p className="panel-tag">阶段 2 · 采集执行</p>
              <p className="muted">
                {!hasTask
                  ? "未选择任务，采集不可用。"
                  : collectionInProgress
                    ? "采集中或队列处理中，请等待当前采集结束。"
                    : "按来源触发采集。Twitter 为异步队列。"}
              </p>
              <div className="stage-actions">
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在采集公开页面...", "collect-public")} disabled={!hasTask || collectionInProgress}>采集页面</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在采集公开页面...", "collect-public")} disabled={!hasTask || collectionInProgress}>采集文档</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在解析 Whitepaper PDF...", "collect-whitepaper-pdf")} disabled={!hasTask || collectionInProgress}>解析 PDF</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在通过浏览器采集 Twitter 页面...", "collect-twitter-browser")} disabled={!hasTask || collectionInProgress}>采集 Twitter</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在采集 Telegram 社区...", "collect-telegram")} disabled={!hasTask || collectionInProgress}>采集 TG</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在采集 Discord 社区...", "collect-discord")} disabled={!hasTask || collectionInProgress}>采集 Discord</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void runAction("正在采集链上指标...", "collect-onchain")} disabled={!hasTask || collectionInProgress}>采集链上</button>
              </div>
              {twitterBrowserStatus ? (
                <div className={`collector-status collector-status-${twitterBrowserStatus.tone}`}>
                  <strong>Twitter 浏览器采集：{twitterBrowserStatus.label}</strong>
                  <p>{twitterBrowserStatus.detail}</p>
                </div>
              ) : null}
            </section>

            <section className="stage-card">
              <p className="panel-tag">阶段 3 · 分析生成</p>
              <p className="muted">{canRunAnalysis ? "已满足运行条件，可生成最新分析。" : "需先完成至少一次当前任务采集，且无进行中的采集。"} </p>
              <div className="stage-actions">
                <button type="button" className="submit-review" onClick={() => void runAction("正在运行分析...", "analyze-factors")} disabled={!canRunAnalysis}>运行分析</button>
              </div>
            </section>

            <section className="stage-card">
              <p className="panel-tag">阶段 4 · 人工复核</p>
              <p className="muted">{canReview ? "可对当前选中三级因子提交人工复核。" : "需先有分析结果，且当前没有进行中的采集。"} </p>
              <div className="stage-actions">
                <button type="button" className="submit-review secondary-action" onClick={handleReviewFactor} disabled={!canReview || !selectedFactorId}>
                  提交复核
                </button>
              </div>
            </section>

            <section className="stage-card">
              <p className="panel-tag">阶段 5 · 发布冻结</p>
              <p className="muted">发布版本入口预留，当前请以分析版本快照作为阶段性结果。</p>
              <div className="stage-actions">
                <button type="button" className="submit-review secondary-action" disabled title="发布流程即将支持">发布版本（即将支持）</button>
              </div>
            </section>
          </div>
        </div>

        <section className="hierarchy-card">
          <div className="hierarchy-toolbar">
            <p className="eyebrow">Task Hierarchy</p>
            <button type="button" className="submit-review secondary-action hierarchy-toggle-all" onClick={handleToggleAllHierarchy}>
              {allExpanded ? "一键收起" : "一键展开"}
            </button>
          </div>
          <label className="task-selector">
            <span>当前任务</span>
            <select
              value={selectedTaskId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedTaskId(value || null);
              }}
            >
              <option value="">未选择任务</option>
              {selectableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.project_name} · {task.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <p className="muted">
              {selectedTask ? `当前聚焦：${selectedTask.project_name} · 风险等级 ${selectedTask.risk_level ?? "未知"}` : "先加载历史任务或创建新任务，再通过下拉切换。"}
            </p>
          </label>
          <div className="hierarchy-level1">
            <button
              type="button"
              className="hierarchy-button hierarchy-head hierarchy-collapsible"
              onClick={() => setLevel1Expanded((current) => !current)}
            >
              <span className="panel-tag">一级任务</span>
              <strong>{TASK_HIERARCHY.level1}</strong>
              <span className="hierarchy-toggle-mark">{level1Expanded ? "收起" : "展开"}</span>
            </button>
            {level1Expanded ? <p className="muted">该层用于定义产品基本面评估的总任务边界。</p> : null}
          </div>
          {level1Expanded ? (
            <div className="hierarchy-stack">
              {TASK_HIERARCHY.level2.map((dimension) => {
                const expanded = expandedDimensions.has(dimension.name);
                return (
                  <article key={dimension.name} className="hierarchy-level2">
                    <button
                      type="button"
                      className="hierarchy-button hierarchy-head hierarchy-collapsible"
                      onClick={() => {
                        handleSelectDimension(dimension.name);
                        handleToggleDimension(dimension.name);
                      }}
                    >
                      <span className="panel-tag">二级任务</span>
                      <strong>{dimension.name}</strong>
                      <span className="hierarchy-toggle-mark">{expanded ? "收起" : "展开"}</span>
                    </button>
                    {expanded ? (
                      <div className="chip-row">
                        {dimension.factors.map((factor) => (
                          <button key={`${dimension.name}-${factor}`} type="button" className="chip hierarchy-chip hierarchy-button" onClick={() => handleSelectFactor(dimension.name, factor)}>
                            三级：{factor}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </section>

      <section className="main-panel">
        {!selectedTaskId ? (
          <section className="empty-state-card">
            <strong>分析区暂为空</strong>
            <p className="muted">请先在左侧填写信息并点击“创建任务”，创建后这里会展示分析工作区。</p>
          </section>
        ) : (
          <>
        <header className="hero">
          <div>
            <p className="eyebrow">Analysis Workspace</p>
            <h2>{snapshot?.project.name ?? "Loading project..."}</h2>
          </div>
          <div className="hero-metrics">
            <div className="metric-block"><span className="metric-label">Final Score</span><strong>{report?.report?.final_score?.toFixed(1) ?? "--"}</strong></div>
            <div className="metric-block"><span className="metric-label">Risk</span><strong>{report?.report?.risk_level ?? "--"}</strong></div>
            <div className="metric-block"><span className="metric-label">Evidence</span><strong>{snapshot?.summary.evidenceCount ?? 0}</strong></div>
            <button
              type="button"
              className="hero-action"
              onClick={() => void runAction("正在运行分析...", "analyze-factors")}
              disabled={!canRunAnalysis}
              title={!hasTask ? "请先选择任务" : canRunAnalysis ? "运行当前任务分析" : "需先完成一次当前任务采集，且无进行中的采集"}
            >
              运行分析
            </button>
          </div>
        </header>

        {actionState ? <p className="action-banner">{actionState}</p> : null}

        {lastCollectionResult ? (
          <section className="panel">
            <div className="panel-title-row"><h3>本次采集结果</h3><span className="panel-tag">{lastCollectionResult.evidenceCount} 条证据</span></div>
            <p className="muted">成功 {lastCollectionResult.collectedSources.length} | 跳过 {lastCollectionResult.skippedSources.length}</p>
            {lastCollectionResult.warnings.length ? <div className="chip-row">{lastCollectionResult.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : <p className="muted">本次采集没有额外警告。</p>}
          </section>
        ) : null}

        <section className="panel-grid">
          {activeHierarchyLevel === "level2" ? (
            <>
              <article className="panel report-panel">
                <div className="panel-title-row">
                  <h3>最终分析报告</h3>
                  <span className="panel-tag">{selectedDimensionName}</span>
                </div>
                {finalReport ? (
                  <div className="final-report-layout">
                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>最终分析报告</h4>
                        <span className={`score-pill ${scoreTone(finalReport.execution_summary.final_score)}`}>
                          {finalReport.execution_summary.final_score.toFixed(1)} / {finalReport.execution_summary.risk_level_label}
                        </span>
                      </div>
                      <p className="lead">{finalReport.execution_summary.headline}</p>
                      <p className="muted">{finalReport.overall_assessment.conclusion}</p>
                    </section>

                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>维度概览</h4>
                        <span className="panel-tag">{finalReport.dimension_overview.items.length} 个维度</span>
                      </div>
                      <div className="dimension-grid">
                        {finalReport.dimension_overview.items.map((dimension) => (
                          <div key={dimension.dimension_key} className="dimension-card static-card report-dimension-card">
                            <span>{dimension.dimension_name}</span>
                            <strong className={scoreTone(dimension.final_score)}>{dimension.final_score.toFixed(1)}</strong>
                            <p>{dimension.judgement}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {finalReport.overall_assessment.content_domain_overview ? (
                      <section className="report-section">
                        <div className="panel-title-row">
                          <h4>内容资料面概况</h4>
                          <span className="panel-tag">
                            {finalReport.overall_assessment.content_domain_overview.website_page_count +
                              finalReport.overall_assessment.content_domain_overview.docs_page_count +
                              finalReport.overall_assessment.content_domain_overview.whitepaper_section_count} 条内容快照
                          </span>
                        </div>
                        <p>{finalReport.overall_assessment.content_domain_overview.note}</p>
                        <div className="chip-row">
                          <span className="chip">官网 {finalReport.overall_assessment.content_domain_overview.website_page_count} 页</span>
                          <span className="chip">Docs {finalReport.overall_assessment.content_domain_overview.docs_page_count} 页</span>
                          <span className="chip">白皮书 {finalReport.overall_assessment.content_domain_overview.whitepaper_section_count} 段</span>
                          <span className="chip">约 {finalReport.overall_assessment.content_domain_overview.total_characters} 字符</span>
                        </div>
                        {finalReport.overall_assessment.content_domain_overview.sample_topics.length > 0 ? (
                          <div className="chip-row">
                            {finalReport.overall_assessment.content_domain_overview.sample_topics.map((topic) => (
                              <span key={`topic-${topic}`} className="chip neutral-chip">{topic}</span>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>关键问题汇总</h4>
                        <span className="panel-tag">{finalReport.key_issues.items.length} 项</span>
                      </div>
                      <div className="report-list">
                        {finalReport.key_issues.items.map((item) => (
                          <div key={item.factor_key} className="report-list-item">
                            <strong>{item.factor_name}</strong>
                            <p>{item.issue_statement}</p>
                            <p className="muted">{item.business_impact}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>关键证据汇总</h4>
                        <span className="panel-tag">{finalReport.key_evidence.groups.length} 组</span>
                      </div>
                      <div className="report-list">
                        {finalReport.key_evidence.groups.map((group) => (
                          <div key={group.source_group} className="report-list-item">
                            <strong>{group.source_group}</strong>
                            <div className="evidence-stack compact-stack">
                              {group.items.map((item) => (
                                <div key={`${group.source_group}-${item.title}-${item.captured_at}`} className="evidence-card">
                                  <span className="evidence-type">{evidenceTypeLabel(item.evidence_type)}</span>
                                  <strong>{item.title}</strong>
                                  <p>{item.summary}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>结论与建议入口</h4>
                        <span className="panel-tag">二级任务结论</span>
                      </div>
                      <p>{finalReport.conclusion_and_next_step.conclusion}</p>
                      <div className="chip-row">
                        {finalReport.conclusion_and_next_step.priority_review_areas.map((item) => (
                          <span key={`priority-${item}`} className="chip risk-chip">优先复核：{item}</span>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <p className="muted">当前任务还没有可用的最终分析报告，请先运行分析。</p>
                )}
              </article>

              <article className="panel factor-panel">
                <div className="panel-title-row">
                  <h3>因子评估看板</h3>
                  <span className="panel-tag">{selectedDimensionFactors.length} 个因子</span>
                </div>
                <div className="factor-list">
                  {selectedDimensionFactors.map((factor) => (
                    <button
                      key={factor.id}
                      type="button"
                      className={`factor-row ${selectedFactorId === factor.id ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedFactorId(factor.id);
                        setActiveHierarchyLevel("level3");
                      }}
                    >
                      <div>
                        <div className="factor-name">{factor.factor_name}</div>
                        <div className="factor-sub">{factor.dimension_name} · {factor.status}</div>
                      </div>
                      <strong className={scoreTone(factor.final_score)}>{factor.final_score.toFixed(1)}</strong>
                    </button>
                  ))}
                  {selectedDimensionFactors.length === 0 ? <p className="muted">当前维度还没有因子结果。</p> : null}
                </div>
              </article>

              <article className="panel version-panel">
                <div className="panel-title-row"><h3>采集运行记录</h3><span className="panel-tag">{runs.length} 条</span></div>
                <div className="version-list">
                  {runs.map((run) => (
                    <div key={run.id} className="version-row">
                      <strong>{collectorLabel(run.collector_key)} · {sourceStatusLabel(run.status)}</strong>
                      <span>{sourceTypeLabel(run.source_type)} | 证据 {run.evidence_count} 条 | 成功 {run.collected_count} | 跳过 {run.skipped_count}</span>
                      {run.warnings.length ? <div className="chip-row">{run.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : null}
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : (
            <article className="panel report-panel">
              <div className="panel-title-row">
                <h3>三级因子分析</h3>
                <span className="panel-tag">{selectedFactor?.factor_name ?? "未选择因子"}</span>
              </div>
              {factorDetail ? (
                <div className="final-report-layout">
                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>关键问题</h4>
                      <span className="panel-tag">{confidenceLabel(factorDetail.factor.confidence_level)}</span>
                    </div>
                    <p>{factorDetail.factor.score_reason}</p>
                    <div className="chip-row">
                      {factorDetail.factor.risk_points.map((item) => <span key={item} className="chip risk-chip">{item}</span>)}
                    </div>
                  </section>

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>关键证据</h4>
                      <span className="panel-tag">{factorDetail.evidences.length} 条</span>
                    </div>
                    <div className="evidence-stack">
                      {groupFactorEvidencesBySource(factorDetail.evidences).map((group) => (
                        <section key={group.key} className="evidence-group">
                          <div className="panel-title-row"><h5>{group.title}</h5><span className="panel-tag">{group.items.length} 条</span></div>
                          <div className="evidence-stack">
                            {group.items.map((evidence) => (
                              <div key={evidence.id} className="evidence-card">
                                <span className="evidence-type">{evidenceTypeLabel(evidence.evidence_type)}</span>
                                <strong>{evidence.title ?? "Untitled evidence"}</strong>
                                <p>{evidence.summary ?? "暂无摘要。"}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>结论与建议入口</h4>
                      <span className="panel-tag">三级因子结论</span>
                    </div>
                    <p>
                      {(factorDetail.factor.risk_points[0] ?? "当前因子已完成分析，可结合关键问题继续复核。")}
                    </p>
                    <div className="chip-row">
                      {factorDetail.factor.opportunity_points.map((item) => <span key={item} className="chip opp-chip">{item}</span>)}
                    </div>
                  </section>
                </div>
              ) : (
                <p className="muted">请选择一个三级因子查看分析内容。</p>
              )}
            </article>
          )}
        </section>
          </>
        )}
      </section>
    </main>
  );
}
