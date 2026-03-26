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
  factor_key: string;
  factor_name: string;
  final_score: number | null;
  score_reason: string;
  risk_points_json: string;
  evidence_refs_json: string;
};

type EvidenceRow = {
  id: string;
  evidence_type: string;
  title: string | null;
  summary: string | null;
  raw_content: string | null;
  credibility_level: string;
  captured_at: string;
};

type VersionMeta = {
  id: string;
  version_type: string;
  created_at: string;
};

interface ContentDomainPagePayload {
  domainType?: "website" | "docs" | "whitepaper";
  title?: string | null;
  heading?: string | null;
  contentLength?: number | null;
  cleanText?: string | null;
  text?: string | null;
  sectionType?: "full_document" | "section";
  sectionCount?: number | null;
}

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
  onchain_metric: "链上",
  onchain_contract_profile: "链上",
  onchain_role_assessment: "链上",
  onchain_code_features: "链上"
};

const cleanReason = (value: string) => value.replace(/\s+Analysis mode: .+?\.$/, "").trim();
const summarizeDimension = (score: number): string =>
  score < 4
    ? "该维度明显偏弱，已经对整体判断形成拖累。"
    : score < 7
      ? "该维度表现中性偏弱，仍需结合关键问题继续复核。"
      : "该维度相对稳健，可作为当前结论中的积极支撑项。";
const factorImpactText = (score: number | null): string =>
  (score ?? 0) < 4
    ? "该问题对整体判断形成明显负面影响。"
    : (score ?? 0) < 7
      ? "该问题对整体判断形成中性偏弱影响。"
      : "该项表现相对稳定，对整体判断形成一定支撑。";
const overallJudgement = (riskLevel: string) =>
  riskLevel === "high"
    ? "当前项目整体风险偏高，不适合直接进入积极推进状态。"
    : riskLevel === "medium"
      ? "当前项目具备继续评估空间，但仍需优先处理关键风险与证据不足项。"
      : "当前项目整体状态相对稳定，可进入下一步策略讨论。";
const conclusionText = (riskLevel: string) =>
  riskLevel === "high"
    ? "建议暂不直接推进，应先围绕高风险维度补证据并完成重点复核。"
    : riskLevel === "medium"
      ? "建议继续推进，但进入策略层前应先确认关键问题是否可被修正。"
      : "建议进入策略层，围绕当前较强维度制定更明确的运营方案。";

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

export const getFinalAnalysisReport = async (db: AppDbClient, taskId: string) => {
  const project = await db.one<{ name: string }>(
    `SELECT p.name FROM projects p JOIN analysis_tasks t ON t.project_id = p.id WHERE t.id = $1`,
    [taskId]
  );
  const report = await db.one<ReportRow>(
    `SELECT final_score, risk_level, summary, data_quality_note FROM reports WHERE task_id = $1`,
    [taskId]
  );
  if (!project || !report) return null;

  const [dimensions, factors, reviewCountRow, versions] = await Promise.all([
    db.query<DimensionRow>(
      `SELECT dimension_key, dimension_name, final_score, summary
       FROM dimensions WHERE task_id = $1 ORDER BY final_score ASC, dimension_name ASC`,
      [taskId]
    ),
    db.query<FactorRow>(
      `SELECT factor_key, factor_name, final_score, score_reason, risk_points_json, evidence_refs_json
       FROM factors WHERE task_id = $1 ORDER BY final_score ASC, factor_name ASC`,
      [taskId]
    ),
    db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM review_records WHERE task_id = $1`, [taskId]),
    db.query<VersionMeta>(`SELECT id, version_type, created_at FROM report_versions WHERE task_id = $1 ORDER BY created_at DESC`, [taskId])
  ]);

  const evidenceIds = Array.from(new Set(factors.flatMap((factor) => parseJsonArray(factor.evidence_refs_json))));
  const evidences =
    evidenceIds.length > 0
      ? await db.query<EvidenceRow>(
          `SELECT id, evidence_type, title, summary, raw_content, credibility_level, captured_at
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
    factor_name: factor.factor_name,
    statement: `${factor.factor_name} 当前偏弱，${factorImpactText(factor.final_score)}`,
    supporting_reason: cleanReason(factor.score_reason)
  }));
  const positiveSignals = [...factors]
    .filter((factor) => (factor.final_score ?? 0) >= 7)
    .slice(0, 2)
    .map((factor) => ({
      factor_key: factor.factor_key,
      factor_name: factor.factor_name,
      statement: `${factor.factor_name} 当前表现相对稳定。`
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
      review_count: reviewCountRow?.count ?? 0
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
      recommended_decision: DECISION_LABELS[report.risk_level] ?? "建议继续复核",
      content_domain_overview: contentDomainOverview
    },
    dimension_overview: {
      items: dimensions.map((dimension) => ({
        dimension_key: dimension.dimension_key,
        dimension_name: dimension.dimension_name,
        final_score: dimension.final_score,
        summary: dimension.summary,
        judgement: summarizeDimension(dimension.final_score)
      }))
    },
    key_issues: {
      items: keyProblemFactors.map((factor) => ({
        factor_key: factor.factor_key,
        factor_name: factor.factor_name,
        final_score: factor.final_score,
        issue_statement: cleanReason(factor.score_reason),
        business_impact: factorImpactText(factor.final_score),
        risk_points: parseJsonArray(factor.risk_points_json)
      }))
    },
    key_evidence: {
      groups: evidenceGroups,
      content_domain_snapshot: contentDomainOverview
    },
    conclusion_and_next_step: {
      conclusion: conclusionText(report.risk_level),
      priority_review_areas: weakestDimensions.map((dimension) => dimension.dimension_name),
      retained_strengths: strongestDimensions.map((dimension) => dimension.dimension_name),
      strategy_entry_note: "本报告完成分析层收口，完整运营策略应在策略层单独生成。"
    }
  };
};
