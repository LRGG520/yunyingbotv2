import { createChatCompletion, loadLlmRuntimeConfig } from "../llm/openai-compatible-client.js";
import type { PromptTemplateBundle } from "../prompts/load-prompt-template.js";
import { parseJsonObject } from "../tasks/parse-json.js";

interface EvidenceRecord {
  id: string;
  evidence_type: string;
  title: string | null;
  summary: string | null;
  raw_content?: string | null;
}

interface FactorDefinition {
  factor_key: string;
  factor_name: string;
  description: string;
  expected_evidence_types: string[];
}

interface FactorAnalysisOutput {
  aiScore: number;
  confidenceLevel: "low" | "medium" | "high";
  scoreReason: string;
  riskPoints: string[];
  opportunityPoints: string[];
  evidenceRefs: string[];
  evidenceSufficiency: "none" | "partial" | "sufficient";
  analysisMode: "remote_llm" | "heuristic_fallback";
  fallbackReason?: string;
  promptPreview: {
    system: string;
    task: string;
    schema: string;
  };
}

interface TwitterMetricsPayload {
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
  };
  discussion?: {
    projectRelevantRatio?: number | null;
    qaInteractionRatio?: number | null;
    offTopicRatio?: number | null;
  };
}

interface CommunityQualityAssessmentPayload {
  overallStatus?: string | null;
  activityQualityScore?: number | null;
  discussionEffectivenessScore?: number | null;
  participationDepthScore?: number | null;
  botRiskScore?: number | null;
  keyFindings?: string[];
}

interface ContentDomainPagePayload {
  domainType?: "website" | "docs" | "whitepaper";
  pageUrl?: string;
  discoveredFrom?: string | null;
  title?: string | null;
  summary?: string | null;
  cleanText?: string | null;
  internalLinks?: string[];
  contentLength?: number | null;
  pageIndex?: number | null;
  pageLimit?: number | null;
  sectionType?: "full_document" | "section";
  sectionIndex?: number | null;
  heading?: string | null;
  text?: string | null;
  sectionCount?: number | null;
  pageCount?: number | null;
}

const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));

const keywordBoostMap: Record<string, string[]> = {
  website_completeness: ["docs", "documentation", "about", "overview"],
  whitepaper_depth: ["documentation", "api", "spec", "guide"],
  product_functionality: ["start", "usage", "install", "getting started"],
  narrative_market_fit: ["api", "developer", "platform", "tooling"],
  claim_whitepaper_consistency: ["documentation", "guide", "about"],
  whitepaper_onchain_consistency: ["contract", "chain", "network", "api"]
};

const detectKeywordBoost = (factorKey: string, evidences: EvidenceRecord[]): number => {
  const keywords = keywordBoostMap[factorKey] ?? [];
  if (keywords.length === 0) {
    return 0;
  }

  const haystack = evidences
    .map((evidence) => `${evidence.title ?? ""} ${evidence.summary ?? ""}`.toLowerCase())
    .join(" ");

  const matches = keywords.filter((keyword) => haystack.includes(keyword)).length;
  return matches * 0.35;
};

const extractTwitterMetrics = (evidences: EvidenceRecord[]) => {
  for (const evidence of evidences) {
    if (evidence.evidence_type !== "twitter_post_detail") {
      continue;
    }

    const parsed = parseJsonObject<TwitterMetricsPayload>(evidence.raw_content);
    if (parsed?.metrics) {
      return parsed.metrics;
    }
  }

  return null;
};

const extractTwitterAssessment = (evidences: EvidenceRecord[]) => {
  for (const evidence of evidences) {
    if (evidence.evidence_type !== "twitter_page_assessment") {
      continue;
    }

    const parsed = parseJsonObject<TwitterAssessmentPayload>(evidence.raw_content);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractCommunityWindowSummary = (evidences: EvidenceRecord[]) => {
  for (const evidence of evidences) {
    if (evidence.evidence_type !== "community_window_summary") {
      continue;
    }

    const parsed = parseJsonObject<CommunityWindowSummaryPayload>(evidence.raw_content);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractCommunityStructureMetrics = (evidences: EvidenceRecord[]) => {
  for (const evidence of evidences) {
    if (evidence.evidence_type !== "community_structure_metrics") {
      continue;
    }

    const parsed = parseJsonObject<CommunityStructureMetricsPayload>(evidence.raw_content);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractCommunityQualityAssessment = (evidences: EvidenceRecord[]) => {
  for (const evidence of evidences) {
    if (evidence.evidence_type !== "community_quality_assessment") {
      continue;
    }

    const parsed = parseJsonObject<CommunityQualityAssessmentPayload>(evidence.raw_content);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractContentDomainPages = (evidences: EvidenceRecord[]) =>
  evidences
    .filter((evidence) =>
      evidence.evidence_type === "website_page" ||
      evidence.evidence_type === "docs_page" ||
      evidence.evidence_type === "whitepaper_page"
    )
    .map((evidence) => ({
      evidenceId: evidence.id,
      evidenceType: evidence.evidence_type,
      payload: parseJsonObject<ContentDomainPagePayload>(evidence.raw_content),
      title: evidence.title,
      summary: evidence.summary
    }))
    .filter((item) => item.payload !== null);

const buildContentDomainNotes = (factorKey: string, evidences: EvidenceRecord[]): string[] => {
  if (
    factorKey !== "website_completeness" &&
    factorKey !== "whitepaper_depth" &&
    factorKey !== "product_functionality" &&
    factorKey !== "narrative_market_fit" &&
    factorKey !== "claim_whitepaper_consistency" &&
    factorKey !== "whitepaper_onchain_consistency"
  ) {
    return [];
  }

  const pages = extractContentDomainPages(evidences);
  if (pages.length === 0) {
    return [];
  }

  const websitePages = pages.filter((item) => item.evidenceType === "website_page");
  const docsPages = pages.filter((item) => item.evidenceType === "docs_page");
  const whitepaperFull = pages.filter(
    (item) => item.evidenceType === "whitepaper_page" && item.payload?.sectionType === "full_document"
  );
  const whitepaperSections = pages.filter(
    (item) => item.evidenceType === "whitepaper_page" && item.payload?.sectionType === "section"
  );

  const notes: string[] = [];

  if (websitePages.length > 0) {
    const sampleUrls = websitePages
      .slice(0, 5)
      .map((item) => item.payload?.pageUrl ?? item.title ?? "unknown")
      .join(" | ");
    const websiteLimit = websitePages[0]?.payload?.pageLimit ?? null;
    notes.push(
      `Website domain snapshot: ${websitePages.length} pages collected${websiteLimit ? ` (page limit ${websiteLimit})` : ""}. Sample pages: ${sampleUrls}.`
    );
  }

  if (docsPages.length > 0) {
    const docsHeadings = docsPages
      .slice(0, 8)
      .map((item) => item.payload?.title ?? item.title ?? item.payload?.pageUrl ?? "unknown")
      .join(" | ");
    const docsLimit = docsPages[0]?.payload?.pageLimit ?? null;
    notes.push(
      `Docs domain snapshot: ${docsPages.length} pages collected${docsLimit ? ` (page limit ${docsLimit})` : ""}. Sample topics: ${docsHeadings}.`
    );
  }

  if (whitepaperFull.length > 0 || whitepaperSections.length > 0) {
    const sectionCount =
      whitepaperFull[0]?.payload?.sectionCount ??
      whitepaperSections.length;
    const sectionHeadings = whitepaperSections
      .slice(0, 8)
      .map((item) => item.payload?.heading ?? item.title ?? "unknown")
      .join(" | ");
    notes.push(
      `Whitepaper snapshot: ${sectionCount} section chunks collected. Sample section headings: ${sectionHeadings || "none"}.`
    );
  }

  const totalTextLength = pages.reduce((sum, item) => {
    const contentLength =
      item.payload?.contentLength ??
      item.payload?.cleanText?.length ??
      item.payload?.text?.length ??
      0;
    return sum + (Number.isFinite(contentLength) ? Number(contentLength) : 0);
  }, 0);

  if (totalTextLength > 0) {
    notes.push(`Content-domain material size: approximately ${totalTextLength} characters of cleaned text.`);
  }

  return notes;
};

const buildTwitterMetricNotes = (factorKey: string, evidences: EvidenceRecord[]): string[] => {
  if (
    factorKey !== "twitter_abnormal_engagement" &&
    factorKey !== "twitter_content_quality" &&
    factorKey !== "user_structure_anomaly"
  ) {
    return [];
  }

  const metrics = extractTwitterMetrics(evidences);
  const assessment = extractTwitterAssessment(evidences);
  const notes: string[] = [];

  if (assessment?.pageStatus) {
    notes.push(`Twitter page status: ${assessment.pageStatus}.`);
  }

  if (metrics) {
    notes.push(
      `Twitter metrics observed: views=${metrics.views ?? "n/a"}, replies=${metrics.replies ?? "n/a"}, reposts=${metrics.reposts ?? "n/a"}, likes=${metrics.likes ?? "n/a"}, bookmarks=${metrics.bookmarks ?? "n/a"}.`
    );
  }

  if (factorKey === "twitter_content_quality" && assessment?.tweetQualityScore) {
    notes.push(`Browser tweet quality proxy: ${assessment.tweetQualityScore}.`);
  }

  return notes;
};

const buildCommunityNotes = (factorKey: string, evidences: EvidenceRecord[]): string[] => {
  if (
    factorKey !== "community_activity_quality" &&
    factorKey !== "effective_user_signals" &&
    factorKey !== "community_bot_patterns" &&
    factorKey !== "user_structure_anomaly"
  ) {
    return [];
  }

  const summary = extractCommunityWindowSummary(evidences);
  const metrics = extractCommunityStructureMetrics(evidences);
  const assessment = extractCommunityQualityAssessment(evidences);
  const notes: string[] = [];

  if (summary) {
    notes.push(
      `Community window observed: requested=${summary.requestedWindowHours ?? "n/a"}h, effective=${summary.effectiveWindowHours ?? "n/a"}h, messages=${summary.messageCount ?? "n/a"}, speakers=${summary.speakerCount ?? "n/a"}, mode=${summary.historyAccessMode ?? "n/a"}.`
    );
  }

  if (metrics?.activity?.topSpeakersShare !== undefined) {
    notes.push(`Top speaker share: ${metrics.activity.topSpeakersShare}.`);
  }

  if (metrics?.repetition?.duplicateMessageRatio !== undefined) {
    notes.push(`Duplicate message ratio: ${metrics.repetition.duplicateMessageRatio}.`);
  }

  if (metrics?.discussion?.projectRelevantRatio !== undefined) {
    notes.push(`Project relevant discussion ratio: ${metrics.discussion.projectRelevantRatio}.`);
  }

  if (metrics?.discussion?.qaInteractionRatio !== undefined) {
    notes.push(`Q&A interaction ratio: ${metrics.discussion.qaInteractionRatio}.`);
  }

  if (assessment?.overallStatus) {
    notes.push(`Community overall status: ${assessment.overallStatus}.`);
  }

  if (assessment?.keyFindings?.length) {
    notes.push(`Community findings: ${assessment.keyFindings.join(" | ")}.`);
  }

  return notes;
};

const detectTwitterEngagementBoost = (factorKey: string, evidences: EvidenceRecord[]): number => {
  if (
    factorKey !== "twitter_abnormal_engagement" &&
    factorKey !== "twitter_content_quality" &&
    factorKey !== "user_structure_anomaly"
  ) {
    return 0;
  }

  const metrics = extractTwitterMetrics(evidences);
  const assessment = extractTwitterAssessment(evidences);

  if (!metrics && !assessment) {
    return 0;
  }

  const views = metrics?.views ?? 0;
  const replies = metrics?.replies ?? 0;
  const reposts = metrics?.reposts ?? 0;
  const likes = metrics?.likes ?? 0;
  const bookmarks = metrics?.bookmarks ?? 0;
  const engagementTotal = replies + reposts + likes + bookmarks;
  const engagementRate = views > 0 ? engagementTotal / views : 0;

  if (factorKey === "twitter_content_quality") {
    let boost = 0.2;
    boost += Math.min(1.5, (assessment?.tweetQualityScore ?? 0) / 5.5);
    boost += engagementRate >= 0.004 ? 0.8 : engagementRate >= 0.001 ? 0.3 : 0;
    boost += replies >= 20 ? 0.5 : replies >= 5 ? 0.2 : 0;
    return boost;
  }

  if (factorKey === "twitter_abnormal_engagement") {
    let boost = 0.2;
    if (assessment?.pageStatus === "blocked_wall") {
      return 0.2;
    }
    if (views > 0) {
      const replyRate = replies / views;
      const likeRate = likes / views;
      boost += replyRate >= 0.0001 && likeRate >= 0.0005 ? 1.0 : 0.4;
      boost += likeRate > 0.02 ? -0.4 : 0;
      boost += replyRate < 0.00001 && likes > 100 ? -0.6 : 0;
    }
    return boost;
  }

  let boost = 0.1;
  boost += views >= 10000 ? 0.6 : views >= 1000 ? 0.3 : 0;
  boost += assessment?.pageStatus === "weak_capture" ? 0.2 : 0;
  return boost;
};

const detectCommunityBoost = (factorKey: string, evidences: EvidenceRecord[]): number => {
  const summary = extractCommunityWindowSummary(evidences);
  const metrics = extractCommunityStructureMetrics(evidences);
  const assessment = extractCommunityQualityAssessment(evidences);

  if (!summary && !metrics && !assessment) {
    return 0;
  }

  if (factorKey === "community_activity_quality") {
    let boost = 0.2;
    boost += Math.min(1.6, (assessment?.activityQualityScore ?? 0) / 5.5);
    boost += summary?.speakerCount && summary.speakerCount >= 10 ? 0.6 : summary?.speakerCount && summary.speakerCount >= 5 ? 0.2 : -0.2;
    boost += (metrics?.discussion?.projectRelevantRatio ?? 0) >= 0.15 ? 0.4 : -0.2;
    boost += (metrics?.repetition?.shortMessageRatio ?? 1) <= 0.5 ? 0.4 : -0.3;
    return boost;
  }

  if (factorKey === "effective_user_signals") {
    let boost = 0.1;
    boost += Math.min(1.5, (assessment?.discussionEffectivenessScore ?? 0) / 6);
    boost += Math.min(1.2, (assessment?.participationDepthScore ?? 0) / 7);
    boost += (metrics?.discussion?.qaInteractionRatio ?? 0) >= 0.05 ? 0.5 : 0;
    boost += (metrics?.discussion?.projectRelevantRatio ?? 0) >= 0.1 ? 0.4 : -0.2;
    return boost;
  }

  if (factorKey === "community_bot_patterns") {
    let boost = 0.2;
    if ((assessment?.botRiskScore ?? 0) >= 6.5) {
      boost += 1.4;
    } else if ((assessment?.botRiskScore ?? 0) >= 5) {
      boost += 0.8;
    }
    boost += (metrics?.repetition?.duplicateMessageRatio ?? 0) >= 0.15 ? 0.7 : 0;
    boost += (metrics?.repetition?.templateSignalRatio ?? 0) >= 0.1 ? 0.7 : 0;
    boost += (metrics?.activity?.topSpeakersShare ?? 0) >= 0.8 ? 0.6 : 0;
    return boost;
  }

  let boost = 0.1;
  boost += summary?.messageCount && summary.messageCount >= 50 ? 0.3 : 0;
  boost += (metrics?.activity?.topSpeakersShare ?? 0) >= 0.8 ? 0.5 : 0;
  boost += (assessment?.overallStatus ?? "") === "high_risk" ? 0.6 : 0;
  return boost;
};

const detectContentDomainBoost = (factorKey: string, evidences: EvidenceRecord[]): number => {
  if (
    factorKey !== "website_completeness" &&
    factorKey !== "whitepaper_depth" &&
    factorKey !== "product_functionality" &&
    factorKey !== "narrative_market_fit" &&
    factorKey !== "claim_whitepaper_consistency" &&
    factorKey !== "whitepaper_onchain_consistency"
  ) {
    return 0;
  }

  const pages = extractContentDomainPages(evidences);
  if (pages.length === 0) {
    return 0;
  }

  const websitePages = pages.filter((item) => item.evidenceType === "website_page").length;
  const docsPages = pages.filter((item) => item.evidenceType === "docs_page").length;
  const whitepaperSections = pages.filter(
    (item) => item.evidenceType === "whitepaper_page" && item.payload?.sectionType === "section"
  ).length;
  const totalPages = pages.length;

  if (factorKey === "website_completeness") {
    let boost = 0.3;
    boost += websitePages >= 8 ? 1.4 : websitePages >= 4 ? 0.8 : websitePages >= 2 ? 0.4 : 0.1;
    boost += docsPages >= 6 ? 0.6 : docsPages >= 2 ? 0.3 : 0;
    return boost;
  }

  if (factorKey === "whitepaper_depth") {
    let boost = 0.2;
    boost += whitepaperSections >= 8 ? 1.6 : whitepaperSections >= 4 ? 1.0 : whitepaperSections >= 2 ? 0.4 : 0;
    boost += docsPages >= 10 ? 0.5 : docsPages >= 4 ? 0.2 : 0;
    return boost;
  }

  if (factorKey === "product_functionality") {
    let boost = 0.2;
    boost += docsPages >= 8 ? 0.9 : docsPages >= 3 ? 0.4 : 0;
    boost += websitePages >= 4 ? 0.5 : websitePages >= 2 ? 0.2 : 0;
    return boost;
  }

  if (factorKey === "narrative_market_fit") {
    let boost = 0.2;
    boost += totalPages >= 12 ? 0.8 : totalPages >= 6 ? 0.4 : 0.1;
    boost += whitepaperSections >= 4 ? 0.5 : 0;
    return boost;
  }

  let boost = 0.2;
  boost += whitepaperSections >= 4 ? 0.6 : 0.2;
  boost += docsPages >= 4 ? 0.4 : 0;
  boost += websitePages >= 2 ? 0.2 : 0;
  return boost;
};

const buildUserPrompt = (factor: FactorDefinition, evidences: EvidenceRecord[], promptTemplate: PromptTemplateBundle): string => {
  const twitterMetricNotes = buildTwitterMetricNotes(factor.factor_key, evidences);
  const communityNotes = buildCommunityNotes(factor.factor_key, evidences);
  const contentDomainNotes = buildContentDomainNotes(factor.factor_key, evidences);

  return [
    promptTemplate.task,
    "",
    `Current factor: ${factor.factor_name} (${factor.factor_key})`,
    `Factor description: ${factor.description}`,
    `Expected evidence types: ${factor.expected_evidence_types.join(", ") || "none"}`,
    "",
    "Output requirements:",
    "- Return exactly one JSON object",
    "- Do not wrap the response in markdown",
    "- ai_score must be a number between 1 and 10",
    "- confidence_level must be one of: low, medium, high",
    "- evidence_sufficiency must be one of: none, partial, sufficient",
    "",
    "Current evidence:",
    ...evidences.map(
      (evidence) =>
        `- [${evidence.id}] type=${evidence.evidence_type}; title=${evidence.title ?? ""}; summary=${evidence.summary ?? ""}`
    ),
    ...(twitterMetricNotes.length > 0 ? ["", "Twitter structured signals:", ...twitterMetricNotes.map((note) => `- ${note}`)] : []),
    ...(communityNotes.length > 0 ? ["", "Community structured signals:", ...communityNotes.map((note) => `- ${note}`)] : []),
    ...(contentDomainNotes.length > 0
      ? ["", "Content-domain structured signals:", ...contentDomainNotes.map((note) => `- ${note}`)]
      : []),
    "",
    "Return strict JSON that matches the provided schema."
  ].join("\n");
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim().replace(/^\[+|\]+$/g, "").trim() : ""))
    .filter((item) => item.length > 0);
};

const ensureConfidenceLevel = (value: unknown): "low" | "medium" | "high" => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "low";
};

const ensureEvidenceSufficiency = (value: unknown): "none" | "partial" | "sufficient" => {
  if (value === "none" || value === "partial" || value === "sufficient") {
    return value;
  }
  return "partial";
};

const parseRemoteResult = (raw: string): Omit<FactorAnalysisOutput, "promptPreview"> => {
  const parsed = JSON.parse(raw) as {
    factor_key?: string;
    ai_score?: number | string;
    score_reason?: string;
    confidence_level?: string;
    risk_points?: unknown;
    opportunity_points?: unknown;
    evidence_refs?: unknown;
    evidence_sufficiency?: string;
  };

  const aiScoreNumber = typeof parsed.ai_score === "number" ? parsed.ai_score : Number(parsed.ai_score);
  if (!Number.isFinite(aiScoreNumber)) {
    throw new Error("llm_invalid_ai_score");
  }

  return {
    aiScore: clampScore(aiScoreNumber),
    confidenceLevel: ensureConfidenceLevel(parsed.confidence_level),
    scoreReason: typeof parsed.score_reason === "string" ? parsed.score_reason : "Remote model returned no score reason.",
    riskPoints: ensureStringArray(parsed.risk_points),
    opportunityPoints: ensureStringArray(parsed.opportunity_points),
    evidenceRefs: ensureStringArray(parsed.evidence_refs),
    evidenceSufficiency: ensureEvidenceSufficiency(parsed.evidence_sufficiency),
    analysisMode: "remote_llm",
    fallbackReason: undefined
  };
};

const runHeuristicFallback = (
  promptTemplate: PromptTemplateBundle,
  factor: FactorDefinition,
  evidences: EvidenceRecord[],
  fallbackReason?: string
): FactorAnalysisOutput => {
  const matchedEvidences = evidences.filter((evidence) => factor.expected_evidence_types.includes(evidence.evidence_type));
  const coverage =
    factor.expected_evidence_types.length === 0 ? 0 : matchedEvidences.length / factor.expected_evidence_types.length;
  const keywordBoost = detectKeywordBoost(factor.factor_key, matchedEvidences);
  const twitterEngagementBoost = detectTwitterEngagementBoost(factor.factor_key, evidences);
  const communityBoost = detectCommunityBoost(factor.factor_key, evidences);
  const contentDomainBoost = detectContentDomainBoost(factor.factor_key, evidences);
  const score = clampScore(1 + coverage * 7 + keywordBoost + twitterEngagementBoost + communityBoost + contentDomainBoost);
  const confidenceLevel: "low" | "medium" | "high" =
    coverage >= 0.9 ? "high" : coverage >= 0.4 ? "medium" : "low";
  const evidenceSufficiency: "none" | "partial" | "sufficient" =
    matchedEvidences.length === 0 ? "none" : coverage >= 0.75 ? "sufficient" : "partial";

  const reason =
    matchedEvidences.length === 0
      ? `No evidence matched the expected evidence types for ${factor.factor_name}, so the factor remains at a low-confidence baseline.`
      : `Heuristic fallback used prompt-defined factor context plus ${matchedEvidences.length} matching evidence items, with coverage ${coverage.toFixed(2)}, keyword boost ${keywordBoost.toFixed(2)}, twitter engagement boost ${twitterEngagementBoost.toFixed(2)}, community boost ${communityBoost.toFixed(2)}, and content-domain boost ${contentDomainBoost.toFixed(2)}.`;

  const riskPoints =
    matchedEvidences.length === 0
      ? [`No matched evidence types for ${factor.factor_name}.`]
      : [
          "Current score is generated by heuristic fallback because no stable semantic scoring path is guaranteed yet.",
          coverage < 0.75
            ? `Evidence coverage for ${factor.factor_name} is still partial.`
            : `Evidence exists, but this factor should still be verified against richer semantic analysis.`
        ];

  const opportunityPoints =
    matchedEvidences.length === 0
      ? [`Collect ${factor.expected_evidence_types.join(", ")} evidence to enable richer factor analysis.`]
      : [
          `Matched evidence exists for ${factor.factor_name}.`,
          "Prompt template is already wired, so this factor can continue upgrading as collection depth improves."
        ];

  const twitterMetricNotes = buildTwitterMetricNotes(factor.factor_key, evidences);
  const communityNotes = buildCommunityNotes(factor.factor_key, evidences);
  const contentDomainNotes = buildContentDomainNotes(factor.factor_key, evidences);

  return {
    aiScore: score,
    confidenceLevel,
    scoreReason: fallbackReason
      ? `${reason} ${twitterMetricNotes.join(" ")} ${communityNotes.join(" ")} ${contentDomainNotes.join(" ")} Remote analysis fallback reason: ${fallbackReason}.`.trim()
      : `${reason} ${twitterMetricNotes.join(" ")} ${communityNotes.join(" ")} ${contentDomainNotes.join(" ")}`.trim(),
    riskPoints,
    opportunityPoints,
    evidenceRefs: matchedEvidences.map((evidence) => evidence.id),
    evidenceSufficiency,
    analysisMode: "heuristic_fallback",
    fallbackReason,
    promptPreview: {
      system: promptTemplate.system.slice(0, 300),
      task: promptTemplate.task.slice(0, 300),
      schema: promptTemplate.schema.slice(0, 300)
    }
  };
};

export const runFactorAnalysis = async (
  repoRoot: string,
  promptTemplate: PromptTemplateBundle,
  factor: FactorDefinition,
  evidences: EvidenceRecord[]
): Promise<FactorAnalysisOutput> => {
  const llmConfig = loadLlmRuntimeConfig(repoRoot);

  if (!llmConfig) {
    return runHeuristicFallback(promptTemplate, factor, evidences, "llm_config_missing");
  }

  try {
    const raw = await createChatCompletion(llmConfig, [
      {
        role: "system",
        content: `${promptTemplate.system}\n\nOutput JSON schema:\n${promptTemplate.schema}`
      },
      {
        role: "user",
        content: buildUserPrompt(factor, evidences, promptTemplate)
      }
    ]);

    const remoteResult = parseRemoteResult(raw);
    return {
      ...remoteResult,
      promptPreview: {
        system: promptTemplate.system.slice(0, 300),
        task: promptTemplate.task.slice(0, 300),
        schema: promptTemplate.schema.slice(0, 300)
      }
    };
  } catch (error) {
    return runHeuristicFallback(
      promptTemplate,
      factor,
      evidences,
      error instanceof Error ? error.message : "llm_unknown_error"
    );
  }
};
