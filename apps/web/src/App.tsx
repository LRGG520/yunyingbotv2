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
    onchain_rpc_provider: "链上 RPC 采集",
    twitter_public_fetch: "Twitter 公开采集",
    twitter_browser_fetch: "Twitter 浏览器采集",
    telegram_bot_ingestion: "Telegram 机器人采集",
    discord_bot_ingestion: "Discord 机器人采集"
  };
  return labels[collectorKey ?? ""] ?? collectorKey ?? "未知采集器";
};

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
  const [websiteInput, setWebsiteInput] = useState("https://docs.python.org/3/");
  const [docsInput, setDocsInput] = useState("https://nodejs.org/api/documentation.html");
  const [twitterInput, setTwitterInput] = useState("https://twitter.com/OpenAI/status/1900000000000000001");
  const [telegramInput, setTelegramInput] = useState("");
  const [discordInput, setDiscordInput] = useState("");
  const [chainInput, setChainInput] = useState<(typeof CHAIN_OPTIONS)[number]["value"]>("ethereum");
  const [contractInput, setContractInput] = useState("");
  const [notesInput, setNotesInput] = useState("new task from web intake");

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

  const refreshTasks = async () => {
    const payload = await fetchJson<{ items: TaskSummary[] }>("/tasks");
    setTasks(payload.items);
    if (payload.items[0]) setSelectedTaskId((current) => current ?? payload.items[0].id);
    if (payload.items.length === 0) {
      setSelectedTaskId(null);
    }
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
    void refreshTasks();
  }, []);

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
    setActionState(label);
    const result = (await fetch(`/tasks/${selectedTaskId}/${path}`, { method: "POST" }).then((response) => response.json())) as Record<string, unknown>;
    if (path !== "analyze-factors") setLastCollectionResult(normalizeCollectionResult(result));
    await refreshSelectedTask(selectedTaskId);
    await refreshTasks();
    setActionState(`${label.replace("正在", "").replace("...", "")}已刷新。`);
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
    setActionState("正在创建分析任务...");
    const payload = {
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
          .map((value) => ({ type: "url" as const, value })),
        { type: "text", value: notesInput }
      ].filter((item) => item.value.trim())
    };
    const created = (await fetch("/tasks/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json())) as { taskId: string };
    await refreshTasks();
    setSelectedTaskId(created.taskId);
    setActionState("新任务已创建。");
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

  return (
    <main className="shell">
      <section className="rail">
        <div className="rail-header">
          <p className="eyebrow">Intelligence Console</p>
          <h1>Task Grid</h1>
        </div>

        <div className="intake-card">
          <p className="eyebrow">New Intake</p>
          <label>
            <span>Website</span>
            <input value={websiteInput} onChange={(event) => setWebsiteInput(event.target.value)} />
          </label>
          <label>
            <span>Docs / Whitepaper</span>
            <input value={docsInput} onChange={(event) => setDocsInput(event.target.value)} />
          </label>
          <label>
            <span>Twitter / X</span>
            <input value={twitterInput} onChange={(event) => setTwitterInput(event.target.value)} />
          </label>
          <label>
            <span>Telegram</span>
            <input value={telegramInput} onChange={(event) => setTelegramInput(event.target.value)} />
          </label>
          <label>
            <span>Discord</span>
            <input value={discordInput} onChange={(event) => setDiscordInput(event.target.value)} />
          </label>
          <label>
            <span>Target Chain</span>
            <select value={chainInput} onChange={(event) => setChainInput(event.target.value as (typeof CHAIN_OPTIONS)[number]["value"])}>
              {CHAIN_OPTIONS.map((chain) => (
                <option key={chain.value} value={chain.value}>{chain.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Contracts</span>
            <textarea
              value={contractInput}
              onChange={(event) => setContractInput(event.target.value)}
              placeholder={"每行一个合约地址，支持多个"}
            />
          </label>
          <label>
            <span>Notes</span>
            <textarea value={notesInput} onChange={(event) => setNotesInput(event.target.value)} />
          </label>
          <button type="button" className="submit-review" onClick={handleCreateTask}>创建任务</button>
        </div>

        <div className="task-list">
          {tasks.map((task) => (
            <button key={task.id} type="button" className={`task-card ${selectedTaskId === task.id ? "is-active" : ""}`} onClick={() => setSelectedTaskId(task.id)}>
              <div className="task-card-top">
                <span className="task-name">{task.project_name}</span>
                <div className="task-card-actions">
                  <span className={`score-pill ${scoreTone(task.final_score)}`}>{task.final_score?.toFixed(1) ?? "--"}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="task-delete"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleDeleteTask(task.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleDeleteTask(task.id);
                      }
                    }}
                  >
                    删除
                  </span>
                </div>
              </div>
              <p className="task-meta">{task.id.slice(0, 8)} · {reviewStatusLabel(task.review_status)}</p>
              <p className="task-meta">风险等级：{task.risk_level ?? "未知"}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="main-panel">
        <header className="hero">
          <div>
            <p className="eyebrow">Analysis Workspace</p>
            <h2>{snapshot?.project.name ?? "Loading project..."}</h2>
          </div>
          <div className="hero-metrics">
            <div className="metric-block"><span className="metric-label">Final Score</span><strong>{report?.report?.final_score?.toFixed(1) ?? "--"}</strong></div>
            <div className="metric-block"><span className="metric-label">Risk</span><strong>{report?.report?.risk_level ?? "--"}</strong></div>
            <div className="metric-block"><span className="metric-label">Evidence</span><strong>{snapshot?.summary.evidenceCount ?? 0}</strong></div>
            <button type="button" className="hero-action" onClick={() => void runAction("正在运行分析...", "analyze-factors")}>运行分析</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在采集公开页面...", "collect-public")}>采集公开页面</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在采集链上指标...", "collect-onchain")}>采集链上</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在采集 Telegram 社区...", "collect-telegram")}>采集 Telegram</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在采集 Discord 社区...", "collect-discord")}>采集 Discord</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在采集公开 Twitter 信息...", "collect-twitter-public")}>采集公开 Twitter</button>
            <button type="button" className="hero-action" onClick={() => void runAction("正在通过浏览器采集 Twitter 页面...", "collect-twitter-browser")}>浏览器采集 Twitter</button>
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
          <article className="panel report-panel">
            <div className="panel-title-row">
              <h3>最终分析报告</h3>
              <span className="panel-tag">{versionTypeLabel(finalReport?.meta.report_version_type ?? "live_current")}</span>
            </div>
            {finalReport ? (
              <div className="final-report-layout">
                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>执行摘要</h4>
                    <span className={`score-pill ${scoreTone(finalReport.execution_summary.final_score)}`}>
                      {finalReport.execution_summary.final_score.toFixed(1)} / {finalReport.execution_summary.risk_level_label}
                    </span>
                  </div>
                  <p className="lead">{finalReport.execution_summary.headline}</p>
                  <div className="chip-row">
                    <span className="chip">{versionTypeLabel(finalReport.meta.report_version_type)}</span>
                    <span className="chip">人工复核 {finalReport.meta.review_count} 次</span>
                    {finalReport.meta.report_version_created_at ? (
                      <span className="chip">版本时间 {new Date(finalReport.meta.report_version_created_at).toLocaleString()}</span>
                    ) : null}
                  </div>
                  {finalReport.execution_summary.top_problems.length ? (
                    <div className="report-list">
                      {finalReport.execution_summary.top_problems.map((item) => (
                        <div key={item.factor_key} className="report-list-item risk-item">
                          <strong>{item.factor_name}</strong>
                          <p>{item.statement}</p>
                          <p className="muted">{item.supporting_reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {finalReport.execution_summary.positive_signals.length ? (
                    <div className="chip-row">
                      {finalReport.execution_summary.positive_signals.map((item) => (
                        <span key={item.factor_key} className="chip opp-chip">{item.statement}</span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>综合判断</h4>
                    <span className="panel-tag">{finalReport.overall_assessment.recommended_decision}</span>
                  </div>
                  <p>{finalReport.overall_assessment.conclusion}</p>
                  <p className="muted">{finalReport.overall_assessment.data_quality_note}</p>
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

                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>关键问题</h4>
                    <span className="panel-tag">{finalReport.key_issues.items.length} 项</span>
                  </div>
                  <div className="report-list">
                    {finalReport.key_issues.items.map((item) => (
                      <div key={item.factor_key} className="report-list-item">
                        <div className="panel-title-row">
                          <strong>{item.factor_name}</strong>
                          <span className={`score-pill ${scoreTone(item.final_score ?? null)}`}>
                            {item.final_score === null ? "--" : item.final_score.toFixed(1)}
                          </span>
                        </div>
                        <p>{item.issue_statement}</p>
                        <p className="muted">{item.business_impact}</p>
                        {item.risk_points.length ? (
                          <div className="chip-row">
                            {item.risk_points.map((riskPoint) => (
                              <span key={`${item.factor_key}-${riskPoint}`} className="chip risk-chip">{riskPoint}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>关键证据</h4>
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
                              <p className="muted">
                                可信度 {confidenceLabel(item.credibility_level)} | 采集时间 {new Date(item.captured_at).toLocaleString()}
                              </p>
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
                    <span className="panel-tag">分析层收口</span>
                  </div>
                  <p>{finalReport.conclusion_and_next_step.conclusion}</p>
                  <div className="chip-row">
                    {finalReport.conclusion_and_next_step.priority_review_areas.map((item) => (
                      <span key={`priority-${item}`} className="chip risk-chip">优先复核：{item}</span>
                    ))}
                  </div>
                  <div className="chip-row">
                    {finalReport.conclusion_and_next_step.retained_strengths.map((item) => (
                      <span key={`strength-${item}`} className="chip opp-chip">保留优势：{item}</span>
                    ))}
                  </div>
                  <p className="muted">{finalReport.conclusion_and_next_step.strategy_entry_note}</p>
                </section>
              </div>
            ) : (
              <>
                <p className="lead">{report?.report?.summary ?? "暂无报告。"}</p>
                <p className="muted">{report?.report?.data_quality_note ?? ""}</p>
                <div className="dimension-grid">
                  {(report?.dimensions ?? []).map((dimension) => (
                    <div key={dimension.dimension_key} className="dimension-card static-card">
                      <span>{dimension.dimension_name}</span>
                      <strong className={scoreTone(dimension.final_score)}>{dimension.final_score.toFixed(1)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>

          <article className="panel factor-panel">
            <div className="panel-title-row"><h3>因子看板</h3><span className="panel-tag">{snapshot?.summary.factorCount ?? 0} 个因子</span></div>
            <div className="factor-list">{(snapshot?.factors ?? []).map((factor) => <button key={factor.id} type="button" className={`factor-row ${selectedFactorId === factor.id ? "is-selected" : ""}`} onClick={() => setSelectedFactorId(factor.id)}><div><div className="factor-name">{factor.factor_name}</div><div className="factor-sub">{factor.dimension_name} · {factor.status}</div></div><strong className={scoreTone(factor.final_score)}>{factor.final_score.toFixed(1)}</strong></button>)}</div>
          </article>

          <article className="panel">
            <div className="panel-title-row"><h3>来源列表</h3><span className="panel-tag">{sources.length} 个来源</span></div>
            <div className="evidence-stack">{sources.map((source) => <button key={source.id} type="button" className={`factor-row ${selectedSourceId === source.id ? "is-selected" : ""}`} onClick={() => setSelectedSourceId(source.id)}><span className="evidence-type">{sourceTypeLabel(source.source_type)}</span><strong>{source.source_url}</strong><p>{sourceStatusLabel(source.access_status)} | 证据 {source.evidence_count} 条 | {source.is_official ? "官方来源" : "非官方来源"}</p>{source.source_type === "contract" && source.chain_label ? <p className="muted">目标链：{source.chain_label}</p> : null}</button>)}</div>
          </article>

          <article className="panel">
            <div className="panel-title-row"><h3>来源详情</h3><span className="panel-tag">{sourceStatusLabel(sourceDetail?.source?.access_status)}</span></div>
            {sourceDetail ? <>
              <p className="muted">{sourceDetail.source.source_url}</p>

              {sourceDetail.communityContext ? (
                <div className="twitter-detail-block">
                  <div className="panel-title-row">
                    <h3>社区采样上下文</h3>
                    <span className="panel-tag">{sourceTypeLabel(sourceDetail.communityContext.platform)}</span>
                  </div>
                  <div className="dimension-grid metric-grid">
                    <div className="dimension-card static-card"><span>目标标签</span><strong>{sourceDetail.communityContext.target_label ?? "--"}</strong></div>
                    <div className="dimension-card static-card"><span>目标类型</span><strong>{sourceDetail.communityContext.target_kind ?? "--"}</strong></div>
                    <div className="dimension-card static-card"><span>请求窗口</span><strong>{sourceDetail.communityContext.requested_window_hours}h</strong></div>
                    <div className="dimension-card static-card"><span>有效窗口</span><strong>{sourceDetail.communityContext.effective_window_hours ? `${sourceDetail.communityContext.effective_window_hours}h` : "--"}</strong></div>
                  </div>
                  <div className="chip-row">
                    <span className="chip">{historyAccessModeLabel(sourceDetail.communityContext.history_access_mode)}</span>
                    <span className="chip">{botAccessStatusLabel(sourceDetail.communityContext.bot_access_status)}</span>
                  </div>
                </div>
              ) : null}

              {sourceDetail.onchainContext ? (
                <div className="twitter-detail-block">
                  <div className="panel-title-row">
                    <h3>链上 L1 基础识别</h3>
                    <span className="panel-tag">{sourceDetail.onchainContext.chainLabel}</span>
                  </div>
                  <p className="lead compact-lead">{onchainL1Summary(sourceDetail.onchainDetail)}</p>
                  <p className="muted">{onchainL1BoundaryText}</p>
                  <div className="dimension-grid metric-grid">
                    <div className="dimension-card static-card"><span>目标链</span><strong>{sourceDetail.onchainContext.chainLabel}</strong></div>
                    <div className="dimension-card static-card"><span>基础识别结论</span><strong>{onchainReadinessLabel(sourceDetail.onchainDetail?.hasCode)}</strong></div>
                    <div className="dimension-card static-card"><span>代码识别</span><strong>{sourceDetail.onchainDetail?.hasCode === null ? "--" : sourceDetail.onchainDetail?.hasCode ? "已检测到" : "未检测到"}</strong></div>
                    <div className="dimension-card static-card"><span>最新区块</span><strong>{sourceDetail.onchainDetail?.latestBlock ?? "--"}</strong></div>
                    <div className="dimension-card static-card"><span>原生币余额</span><strong>{onchainBalanceLabel(sourceDetail.onchainDetail?.balance)}</strong></div>
                  </div>
                  <div className="chip-row">
                    <span className="chip">当前层级：链上 L1 基础识别</span>
                    {sourceDetail.onchainContext.contractRoleHint ? (
                      <span className="chip">角色备注：{sourceDetail.onchainContext.contractRoleHint}</span>
                    ) : (
                      <span className="chip">角色备注：暂未填写</span>
                    )}
                  </div>

                  {sourceDetail.onchainDetail?.contractProfile ? (
                    <section className="factor-metric-strip">
                      <div className="panel-title-row">
                        <h5>规则识别结果</h5>
                        <span className="panel-tag">
                          {sourceDetail.onchainDetail.contractProfile.detectedInterfaces.length
                            ? `${sourceDetail.onchainDetail.contractProfile.detectedInterfaces.length} 项特征`
                            : "未识别明显特征"}
                        </span>
                      </div>
                      <div className="dimension-grid metric-grid">
                        <div className="dimension-card static-card"><span>名称</span><strong>{sourceDetail.onchainDetail.contractProfile.tokenMetadata.name ?? "--"}</strong></div>
                        <div className="dimension-card static-card"><span>符号</span><strong>{sourceDetail.onchainDetail.contractProfile.tokenMetadata.symbol ?? "--"}</strong></div>
                        <div className="dimension-card static-card"><span>精度</span><strong>{sourceDetail.onchainDetail.contractProfile.tokenMetadata.decimals ?? "--"}</strong></div>
                        <div className="dimension-card static-card"><span>总供应</span><strong>{sourceDetail.onchainDetail.contractProfile.tokenMetadata.totalSupply ?? "--"}</strong></div>
                        <div className="dimension-card static-card"><span>Owner</span><strong>{sourceDetail.onchainDetail.contractProfile.ownership.owner ?? "--"}</strong></div>
                        <div className="dimension-card static-card"><span>Implementation</span><strong>{sourceDetail.onchainDetail.contractProfile.proxy.implementationAddress ?? "--"}</strong></div>
                      </div>
                      <div className="chip-row">
                        {sourceDetail.onchainDetail.contractProfile.detectedInterfaces.length ? (
                          sourceDetail.onchainDetail.contractProfile.detectedInterfaces.map((item) => (
                            <span key={item} className="chip">{item}</span>
                          ))
                        ) : (
                          <span className="chip">暂未识别到明显标准接口</span>
                        )}
                      </div>
                    </section>
                  ) : null}

                  {sourceDetail.onchainDetail?.codeFeatures ? (
                    <section className="factor-metric-strip">
                      <div className="panel-title-row">
                        <h5>链上 L2.5 代码特征检测</h5>
                        <span className="panel-tag">{onchainCodeShapeLabel(sourceDetail.onchainDetail.codeFeatures.codeShape)}</span>
                      </div>
                      <p className="muted">
                        {sourceDetail.onchainDetail.codeFeatures.featureReason ?? "当前还没有形成稳定的代码特征判断。"}
                      </p>
                      <div className="dimension-grid metric-grid">
                        <div className="dimension-card static-card"><span>字节码长度</span><strong>{formatMetric(sourceDetail.onchainDetail.codeFeatures.bytecodeLength)}</strong></div>
                        <div className="dimension-card static-card"><span>识别到的选择器</span><strong>{formatMetric(sourceDetail.onchainDetail.codeFeatures.selectorCount)}</strong></div>
                        <div className="dimension-card static-card"><span>复杂度提示</span><strong>{sourceDetail.onchainDetail.codeFeatures.complexityHint ?? "--"}</strong></div>
                      </div>
                      <div className="chip-row">
                        {sourceDetail.onchainDetail.codeFeatures.detectedFeatures.length ? (
                          sourceDetail.onchainDetail.codeFeatures.detectedFeatures.map((item) => (
                            <span key={item} className="chip">{item}</span>
                          ))
                        ) : (
                          <span className="chip">暂未识别到明显代码特征</span>
                        )}
                      </div>
                      {sourceDetail.onchainDetail.codeFeatures.matchedSelectors.length ? (
                        <div className="chip-row">
                          {sourceDetail.onchainDetail.codeFeatures.matchedSelectors.slice(0, 8).map((item) => (
                            <span key={item} className="chip">{item}</span>
                          ))}
                        </div>
                      ) : null}
                      {sourceDetail.onchainDetail.codeFeatures.boundaryNote ? (
                        <p className="muted">{sourceDetail.onchainDetail.codeFeatures.boundaryNote}</p>
                      ) : null}
                    </section>
                  ) : null}

                  {sourceDetail.onchainDetail?.roleAssessment ? (
                    <section className="factor-metric-strip">
                      <div className="panel-title-row">
                        <h5>链上 L2 合约角色识别</h5>
                        <span className="panel-tag">{sourceDetail.onchainDetail.roleAssessment.roleGuess ?? "Unknown"}</span>
                      </div>
                      <p className="muted">
                        {sourceDetail.onchainDetail.roleAssessment.reason ?? "当前还没有形成稳定的角色判断。"}
                      </p>
                      <div className="chip-row">
                        <span className="chip">置信度：{onchainRoleConfidenceLabel(sourceDetail.onchainDetail.roleAssessment.confidence)}</span>
                        <span className="chip">分析方式：{onchainAnalysisModeLabel(sourceDetail.onchainDetail.roleAssessment.analysisMode)}</span>
                      </div>
                      {sourceDetail.onchainDetail.roleAssessment.nextStepHint ? (
                        <p className="muted">{sourceDetail.onchainDetail.roleAssessment.nextStepHint}</p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="factor-metric-strip">
                    <div className="panel-title-row">
                      <h5>相关 LP 候选</h5>
                      <button type="button" className="submit-review" onClick={handleDiscoverLpCandidates}>
                        自动检索
                      </button>
                    </div>
                    {sourceDetail.onchainDetail?.lpCandidates?.length ? (
                      <div className="evidence-stack">
                        {sourceDetail.onchainDetail.lpCandidates.map((candidate) => (
                          <div key={candidate.id} className="evidence-card">
                            <span className="evidence-type">{candidate.dexLabel}</span>
                            <strong>{candidate.lpAddress}</strong>
                            <p>{candidate.rationale}</p>
                            <div className="chip-row">
                              <span className="chip">配对资产：{candidate.quoteTokenLabel}</span>
                              <span className="chip">置信度：{candidate.confidence}</span>
                              <span className="chip">{lpCandidateStatusLabel(candidate.status)}</span>
                            </div>
                            {candidate.status === "pending" ? (
                              <div className="chip-row">
                                <button type="button" className="submit-review" onClick={() => handleLpCandidateAction(candidate.id, "confirm")}>
                                  确认纳入
                                </button>
                                <button type="button" className="ghost-action" onClick={() => handleLpCandidateAction(candidate.id, "ignore")}>
                                  忽略
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">当前还没有 LP 候选。可先点击“自动检索”，再人工确认是否纳入。</p>
                    )}
                  </section>
                </div>
              ) : null}

              {sourceDetail.communityDetail ? (
                <div className="twitter-detail-block">
                  <div className="panel-title-row">
                    <h3>社区质量骨架</h3>
                    <span className="panel-tag">
                      {communityOverallStatusLabel(sourceDetail.communityDetail.qualityAssessment?.overallStatus)}
                    </span>
                  </div>

                  {sourceDetail.communityDetail.windowSummary ? (
                    <div className="dimension-grid metric-grid">
                      <div className="dimension-card static-card"><span>消息总量</span><strong>{formatMetric(sourceDetail.communityDetail.windowSummary.messageCount)}</strong></div>
                      <div className="dimension-card static-card"><span>发言人数</span><strong>{formatMetric(sourceDetail.communityDetail.windowSummary.speakerCount)}</strong></div>
                      <div className="dimension-card static-card"><span>请求窗口</span><strong>{sourceDetail.communityDetail.windowSummary.requestedWindowHours ? `${sourceDetail.communityDetail.windowSummary.requestedWindowHours}h` : "--"}</strong></div>
                      <div className="dimension-card static-card"><span>有效窗口</span><strong>{sourceDetail.communityDetail.windowSummary.effectiveWindowHours ? `${sourceDetail.communityDetail.windowSummary.effectiveWindowHours}h` : "--"}</strong></div>
                    </div>
                  ) : (
                    <p className="muted">社区窗口摘要暂时还没有落入证据。</p>
                  )}

                  {sourceDetail.communityDetail.qualityAssessment ? (
                    <div className="chip-row">
                      <span className="chip opp-chip">活跃质量参考分 {sourceDetail.communityDetail.qualityAssessment.activityQualityScore ?? "--"}</span>
                      <span className="chip opp-chip">讨论有效性参考分 {sourceDetail.communityDetail.qualityAssessment.discussionEffectivenessScore ?? "--"}</span>
                      <span className="chip opp-chip">参与深度参考分 {sourceDetail.communityDetail.qualityAssessment.participationDepthScore ?? "--"}</span>
                      <span className="chip risk-chip">异常风险参考分 {sourceDetail.communityDetail.qualityAssessment.botRiskScore ?? "--"}</span>
                    </div>
                  ) : null}

                  {sourceDetail.communityDetail.structureMetrics ? (
                    <div className="dimension-grid metric-grid">
                      <div className="dimension-card static-card"><span>头部发言占比</span><strong>{formatRatio(sourceDetail.communityDetail.structureMetrics.activity?.topSpeakersShare)}</strong></div>
                      <div className="dimension-card static-card"><span>重复文本占比</span><strong>{formatRatio(sourceDetail.communityDetail.structureMetrics.repetition?.duplicateMessageRatio)}</strong></div>
                      <div className="dimension-card static-card"><span>低信息占比</span><strong>{formatRatio(sourceDetail.communityDetail.structureMetrics.repetition?.lowSignalRatio)}</strong></div>
                      <div className="dimension-card static-card"><span>项目相关讨论占比</span><strong>{formatRatio(sourceDetail.communityDetail.structureMetrics.discussion?.projectRelevantRatio)}</strong></div>
                      <div className="dimension-card static-card"><span>问答互动占比</span><strong>{formatRatio(sourceDetail.communityDetail.structureMetrics.discussion?.qaInteractionRatio)}</strong></div>
                    </div>
                  ) : null}

                  {sourceDetail.communityDetail.qualityAssessment?.keyFindings?.length ? (
                    <div className="chip-row">
                      {sourceDetail.communityDetail.qualityAssessment.keyFindings.map((item) => (
                        <span key={item} className="chip">{item}</span>
                      ))}
                    </div>
                  ) : null}

                  {sourceDetail.communityDetail.messageSamples.length ? (
                    <div className="evidence-stack">
                      {sourceDetail.communityDetail.messageSamples.map((sample) => (
                        <div key={sample.evidenceId} className="evidence-card">
                          <span className="evidence-type">{communityBucketLabel(sample.bucket)}</span>
                          <strong>{sample.title ?? "社区样本包"}</strong>
                          <p>{sample.summary ?? "暂无样本摘要。"}</p>
                          <p className="muted">样本量 {sample.itemCount ?? sample.sampleMessages.length} 条</p>
                          {sample.sampleMessages.length ? (
                            <div className="chip-row">
                              {sample.sampleMessages.slice(0, 3).map((message, index) => (
                                <span key={`${sample.evidenceId}-${index}`} className="chip">
                                  {(message.author ?? "匿名")}：{message.text ?? "空消息"}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">社区样本包暂时还没有落入证据。</p>
                  )}
                </div>
              ) : null}

              {sourceDetail.twitterDetail ? (
                <div className="twitter-detail-block">
                  <div className="panel-title-row"><h3>推文采集结论</h3><span className="panel-tag">{twitterPageStatusLabel(sourceDetail.twitterDetail.pageStatus)}</span></div>
                  <p className="muted">{sourceDetail.twitterDetail.statusReason ?? "暂无页面判断说明。"}</p>
                  {sourceDetail.twitterDetail.text ? <p className="lead compact-lead">{sourceDetail.twitterDetail.text}</p> : null}
                  <div className="dimension-grid metric-grid">
                    <div className="dimension-card static-card"><span>查看</span><strong>{formatMetric(sourceDetail.twitterDetail.metrics?.views)}</strong></div>
                    <div className="dimension-card static-card"><span>回复</span><strong>{formatMetric(sourceDetail.twitterDetail.metrics?.replies)}</strong></div>
                    <div className="dimension-card static-card"><span>转发</span><strong>{formatMetric(sourceDetail.twitterDetail.metrics?.reposts)}</strong></div>
                    <div className="dimension-card static-card"><span>点赞</span><strong>{formatMetric(sourceDetail.twitterDetail.metrics?.likes)}</strong></div>
                    <div className="dimension-card static-card"><span>收藏</span><strong>{formatMetric(sourceDetail.twitterDetail.metrics?.bookmarks)}</strong></div>
                  </div>
                  <div className="chip-row">
                    <span className="chip opp-chip">内容质量参考分 {sourceDetail.twitterDetail.tweetQualityScore ?? "--"}</span>
                    <span className="chip opp-chip">评论质量参考分 {sourceDetail.twitterDetail.commentQualityScore ?? "--"}</span>
                    <span className="chip">可见评论样本 {sourceDetail.twitterDetail.visibleReplyCount ?? 0} 条</span>
                    {sourceDetail.twitterDetail.publishedAt ? <span className="chip">发布时间 {new Date(sourceDetail.twitterDetail.publishedAt).toLocaleString()}</span> : null}
                  </div>
                </div>
              ) : null}

              <div className="evidence-stack">
                {sourceDetail.evidences.length ? sourceDetail.evidences.map((evidence) => <div key={evidence.id} className="evidence-card"><span className="evidence-type">{evidenceTypeLabel(evidence.evidence_type)}</span><strong>{evidence.title ?? "Untitled evidence"}</strong><p>{evidence.summary ?? "暂无摘要。"}</p><p className="muted">可信度 {evidence.credibility_level} | 采集时间 {new Date(evidence.captured_at).toLocaleString()}</p></div>) : <p className="muted">这个来源暂时还没有挂上证据。</p>}
              </div>

              {sourceDetail.relatedRuns.length ? <div className="version-detail"><div className="panel-title-row"><h3>相关采集记录</h3><span className="panel-tag">{sourceDetail.relatedRuns.length}</span></div><div className="version-list">{sourceDetail.relatedRuns.map((run) => <div key={run.id} className="version-row"><strong>{collectorLabel(run.collector_key)} · {sourceStatusLabel(run.status)}</strong><span>证据 {run.evidence_count} 条 | 成功 {run.collected_count} | 跳过 {run.skipped_count}</span>{run.warnings.length ? <div className="chip-row">{run.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : null}</div>)}</div></div> : null}
            </> : <p className="muted">请选择一个来源查看详情。</p>}
          </article>

          <article className="panel detail-panel">
            <div className="panel-title-row"><h3>因子详情</h3><span className="panel-tag">{confidenceLabel(factorDetail?.factor.confidence_level)}</span></div>
            {factorDetail ? <><h4>{factorDetail.factor.factor_name}</h4><p className="muted">{factorDetail.factor.score_reason}</p><div className="chip-row">{factorDetail.factor.risk_points.map((item) => <span key={item} className="chip risk-chip">{item}</span>)}{factorDetail.factor.opportunity_points.map((item) => <span key={item} className="chip opp-chip">{item}</span>)}</div>{factorDetail.twitter_detail?.metrics ? <section className="factor-metric-strip"><div className="panel-title-row"><h5>互动信号速览</h5>{factorDetail.twitter_detail.page_status ? <span className="panel-tag">{twitterPageStatusLabel(factorDetail.twitter_detail.page_status)}</span> : null}</div><div className="dimension-grid metric-grid"><div className="dimension-card static-card"><span>查看</span><strong>{formatMetric(factorDetail.twitter_detail.metrics.views)}</strong></div><div className="dimension-card static-card"><span>回复</span><strong>{formatMetric(factorDetail.twitter_detail.metrics.replies)}</strong></div><div className="dimension-card static-card"><span>转发</span><strong>{formatMetric(factorDetail.twitter_detail.metrics.reposts)}</strong></div><div className="dimension-card static-card"><span>点赞</span><strong>{formatMetric(factorDetail.twitter_detail.metrics.likes)}</strong></div><div className="dimension-card static-card"><span>收藏</span><strong>{formatMetric(factorDetail.twitter_detail.metrics.bookmarks)}</strong></div></div><div className="chip-row">{factorDetail.twitter_detail.tweet_quality_score !== null ? <span className="chip opp-chip">内容质量参考分 {factorDetail.twitter_detail.tweet_quality_score}</span> : null}{factorDetail.twitter_detail.comment_quality_score !== null ? <span className="chip opp-chip">评论质量参考分 {factorDetail.twitter_detail.comment_quality_score}</span> : null}{factorDetail.twitter_detail.visible_reply_count !== null ? <span className="chip">可见评论样本 {factorDetail.twitter_detail.visible_reply_count} 条</span> : null}{factorDetail.twitter_detail.published_at ? <span className="chip">发布时间 {new Date(factorDetail.twitter_detail.published_at).toLocaleString()}</span> : null}</div></section> : null}{factorDetail.community_detail ? <section className="factor-metric-strip"><div className="panel-title-row"><h5>社区信号速览</h5>{factorDetail.community_detail.quality_assessment?.overall_status ? <span className="panel-tag">{communityOverallStatusLabel(factorDetail.community_detail.quality_assessment.overall_status)}</span> : null}</div><div className="dimension-grid metric-grid">{factorDetail.community_detail.window_summary ? <><div className="dimension-card static-card"><span>消息总量</span><strong>{formatMetric(factorDetail.community_detail.window_summary.message_count)}</strong></div><div className="dimension-card static-card"><span>发言人数</span><strong>{formatMetric(factorDetail.community_detail.window_summary.speaker_count)}</strong></div><div className="dimension-card static-card"><span>请求窗口</span><strong>{factorDetail.community_detail.window_summary.requested_window_hours ? `${factorDetail.community_detail.window_summary.requested_window_hours}h` : "--"}</strong></div><div className="dimension-card static-card"><span>有效窗口</span><strong>{factorDetail.community_detail.window_summary.effective_window_hours ? `${factorDetail.community_detail.window_summary.effective_window_hours}h` : "--"}</strong></div></> : null}{factorDetail.community_detail.structure_metrics ? <><div className="dimension-card static-card"><span>头部发言占比</span><strong>{formatRatio(factorDetail.community_detail.structure_metrics.activity?.topSpeakersShare)}</strong></div><div className="dimension-card static-card"><span>重复文本占比</span><strong>{formatRatio(factorDetail.community_detail.structure_metrics.repetition?.duplicateMessageRatio)}</strong></div><div className="dimension-card static-card"><span>低信息占比</span><strong>{formatRatio(factorDetail.community_detail.structure_metrics.repetition?.lowSignalRatio)}</strong></div><div className="dimension-card static-card"><span>项目相关讨论</span><strong>{formatRatio(factorDetail.community_detail.structure_metrics.discussion?.projectRelevantRatio)}</strong></div><div className="dimension-card static-card"><span>问答互动占比</span><strong>{formatRatio(factorDetail.community_detail.structure_metrics.discussion?.qaInteractionRatio)}</strong></div></> : null}</div><div className="chip-row">{factorDetail.community_detail.quality_assessment?.activity_quality_score !== null && factorDetail.community_detail.quality_assessment?.activity_quality_score !== undefined ? <span className="chip opp-chip">活跃质量参考分 {factorDetail.community_detail.quality_assessment.activity_quality_score}</span> : null}{factorDetail.community_detail.quality_assessment?.discussion_effectiveness_score !== null && factorDetail.community_detail.quality_assessment?.discussion_effectiveness_score !== undefined ? <span className="chip opp-chip">讨论有效性参考分 {factorDetail.community_detail.quality_assessment.discussion_effectiveness_score}</span> : null}{factorDetail.community_detail.quality_assessment?.participation_depth_score !== null && factorDetail.community_detail.quality_assessment?.participation_depth_score !== undefined ? <span className="chip opp-chip">参与深度参考分 {factorDetail.community_detail.quality_assessment.participation_depth_score}</span> : null}{factorDetail.community_detail.quality_assessment?.bot_risk_score !== null && factorDetail.community_detail.quality_assessment?.bot_risk_score !== undefined ? <span className="chip risk-chip">异常风险参考分 {factorDetail.community_detail.quality_assessment.bot_risk_score}</span> : null}{factorDetail.community_detail.window_summary?.history_access_mode ? <span className="chip">{historyAccessModeLabel(factorDetail.community_detail.window_summary.history_access_mode)}</span> : null}</div>{factorDetail.community_detail.quality_assessment?.key_findings?.length ? <div className="chip-row">{factorDetail.community_detail.quality_assessment.key_findings.map((item) => <span key={item} className="chip">{item}</span>)}</div> : null}</section> : null}<div className="evidence-stack">{groupFactorEvidencesBySource(factorDetail.evidences).map((group) => <section key={group.key} className="evidence-group"><div className="panel-title-row"><h5>{group.title}</h5><span className="panel-tag">{group.items.length} 条</span></div><div className="evidence-stack">{group.items.map((evidence) => <div key={evidence.id} className="evidence-card"><span className="evidence-type">{evidenceTypeLabel(evidence.evidence_type)}</span><strong>{evidence.title ?? "Untitled evidence"}</strong><p>{evidence.summary ?? "No summary available."}</p>{evidence.insight_summary ? <p className="muted">{evidence.insight_summary}</p> : null}</div>)}</div></section>)}</div><div className="review-form"><h5>人工复核</h5><label><span>复核人</span><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label><label><span>修正分数</span><input value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} /></label><label><span>修正原因</span><input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label><label><span>事实补充</span><textarea value={factSupplement} onChange={(event) => setFactSupplement(event.target.value)} /></label><button type="button" className="submit-review" onClick={handleReviewFactor}>应用复核</button></div></> : <p className="muted">请选择一个因子查看详情。</p>}
          </article>

          <article className="panel version-panel">
            <div className="panel-title-row"><h3>版本流转</h3><span className="panel-tag">{snapshot?.summary.versionCount ?? 0} 个版本</span></div>
            <div className="version-list">{(snapshot?.versions ?? []).map((version) => <button key={version.id} type="button" className={`version-row ${selectedVersionId === version.id ? "is-selected" : ""}`} onClick={() => setSelectedVersionId(version.id)}><strong>{version.version_type}</strong><span>{new Date(version.created_at).toLocaleString()}</span></button>)}</div>
            {versionDetail ? <div className="version-detail"><p className="muted">{versionDetail.report_snapshot?.summary}</p><div className="dimension-grid">{versionDetail.dimension_snapshot.map((dimension) => <div key={dimension.dimension_name} className="dimension-card static-card"><span>{dimension.dimension_name}</span><strong className={scoreTone(dimension.final_score)}>{dimension.final_score.toFixed(1)}</strong></div>)}</div></div> : null}
            <div className="version-detail"><div className="panel-title-row"><h3>采集运行记录</h3><span className="panel-tag">{runs.length} 条</span></div><div className="version-list">{runs.map((run) => <div key={run.id} className="version-row"><strong>{collectorLabel(run.collector_key)} · {sourceStatusLabel(run.status)}</strong><span>{sourceTypeLabel(run.source_type)} | 证据 {run.evidence_count} 条 | 成功 {run.collected_count} | 跳过 {run.skipped_count}</span>{run.warnings.length ? <div className="chip-row">{run.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : null}</div>)}</div></div>
          </article>
        </section>
      </section>
    </main>
  );
}
