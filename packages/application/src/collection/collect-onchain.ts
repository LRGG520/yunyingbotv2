import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { loadRepoEnv } from "../config/load-env.js";
import { createChatCompletion, loadLlmRuntimeConfig } from "../llm/openai-compatible-client.js";
import { recordCollectionRun } from "./record-collection-run.js";

const nowIso = () => new Date().toISOString();

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface ContractSourceRow {
  id: string;
  source_url: string;
}

interface OnchainContextRow {
  source_id: string;
  chain_key: string;
  chain_label: string;
  contract_role_hint: string | null;
}

interface OnchainMetricPayload {
  bytecodePreview: string;
  latestBlock: string;
  balance: string;
  hasCode: boolean;
}

interface OnchainContractProfilePayload {
  chainKey: string;
  chainLabel: string;
  latestBlock: string;
  hasCode: boolean;
  nativeBalance: string;
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
  detectedInterfaces: string[];
}

interface OnchainRoleAssessmentPayload {
  roleGuess: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  nextStepHint: string;
  analysisMode: "remote_llm" | "rule_fallback";
}

interface OnchainCodeFeaturePayload {
  bytecodeLength: number;
  selectorCount: number;
  detectedFeatures: string[];
  matchedSelectors: string[];
  codeShape: "standard_like" | "standard_extended" | "non_standard";
  complexityHint: "low" | "medium" | "high";
  featureReason: string;
  boundaryNote: string;
}

const CHAIN_RPC_ENV_KEYS: Record<string, string> = {
  ethereum: "ONCHAIN_RPC_ETHEREUM",
  bsc: "ONCHAIN_RPC_BSC",
  base: "ONCHAIN_RPC_BASE",
  arbitrum: "ONCHAIN_RPC_ARBITRUM",
  polygon: "ONCHAIN_RPC_POLYGON",
  optimism: "ONCHAIN_RPC_OPTIMISM",
  avalanche: "ONCHAIN_RPC_AVALANCHE"
};

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";

const SELECTOR_FEATURES: Array<{ selector: string; label: string }> = [
  { selector: "06fdde03", label: "name()" },
  { selector: "95d89b41", label: "symbol()" },
  { selector: "313ce567", label: "decimals()" },
  { selector: "18160ddd", label: "totalSupply()" },
  { selector: "70a08231", label: "balanceOf(address)" },
  { selector: "a9059cbb", label: "transfer(address,uint256)" },
  { selector: "23b872dd", label: "transferFrom(address,address,uint256)" },
  { selector: "dd62ed3e", label: "allowance(address,address)" },
  { selector: "095ea7b3", label: "approve(address,uint256)" },
  { selector: "40c10f19", label: "mint(address,uint256)" },
  { selector: "42966c68", label: "burn(uint256)" },
  { selector: "8da5cb5b", label: "owner()" },
  { selector: "f2fde38b", label: "transferOwnership(address)" },
  { selector: "715018a6", label: "renounceOwnership()" },
  { selector: "8456cb59", label: "pause()" },
  { selector: "3f4ba83a", label: "unpause()" },
  { selector: "3659cfe6", label: "upgradeTo(address)" },
  { selector: "4f1ef286", label: "upgradeToAndCall(address,bytes)" },
  { selector: "8129fc1c", label: "initialize()" },
  { selector: "c45a0155", label: "factory()" },
  { selector: "0902f1ac", label: "getReserves()" },
  { selector: "0dfe1681", label: "token0()" },
  { selector: "d21220a7", label: "token1()" }
];

const callRpc = async <T>(rpcUrl: string, method: string, params: unknown[]): Promise<JsonRpcResponse<T>> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`rpc_http_${response.status}`);
  }

  return (await response.json()) as JsonRpcResponse<T>;
};

const hexToDecimalString = (value: string): string => {
  try {
    return BigInt(value).toString(10);
  } catch {
    return value;
  }
};

const readWord = (hex: string, index: number): string | null => {
  const normalized = hex.replace(/^0x/, "");
  const start = index * 64;
  const word = normalized.slice(start, start + 64);
  return word.length === 64 ? word : null;
};

const decodeStringResponse = (value: string | undefined): string | null => {
  if (!value || value === "0x") {
    return null;
  }

  const hex = value.replace(/^0x/, "");
  if (!hex) {
    return null;
  }

  try {
    const offsetWord = readWord(value, 0);
    if (offsetWord) {
      const offsetBytes = Number.parseInt(offsetWord, 16);
      if (Number.isFinite(offsetBytes) && offsetBytes >= 32) {
        const lengthWordIndex = offsetBytes / 32;
        const lengthWord = readWord(value, lengthWordIndex);
        if (lengthWord) {
          const length = Number.parseInt(lengthWord, 16);
          const dataStart = (lengthWordIndex + 1) * 64;
          const dataHex = hex.slice(dataStart, dataStart + length * 2);
          if (dataHex.length >= length * 2) {
            const text = Buffer.from(dataHex, "hex").toString("utf8").replace(/\u0000/g, "").trim();
            if (text) {
              return text;
            }
          }
        }
      }
    }
  } catch {
    // fall through to bytes32-style decode
  }

  try {
    const bytes = Buffer.from(hex.slice(0, 64), "hex");
    const text = bytes.toString("utf8").replace(/\u0000/g, "").trim();
    return text || null;
  } catch {
    return null;
  }
};

const decodeUintResponse = (value: string | undefined): string | null => {
  if (!value || value === "0x") {
    return null;
  }

  try {
    return BigInt(value).toString(10);
  } catch {
    return null;
  }
};

const decodeAddressResponse = (value: string | undefined): string | null => {
  if (!value || value === "0x") {
    return null;
  }

  const hex = value.replace(/^0x/, "").padStart(64, "0");
  const last40 = hex.slice(-40);
  if (/^0+$/.test(last40)) {
    return null;
  }
  return `0x${last40}`;
};

const collectPush4Selectors = (bytecode: string): string[] => {
  const hex = bytecode.replace(/^0x/, "").toLowerCase();
  const selectors = new Set<string>();

  for (let index = 0; index < hex.length - 10; index += 2) {
    const opcode = hex.slice(index, index + 2);
    if (opcode === "63") {
      const selector = hex.slice(index + 2, index + 10);
      if (selector.length === 8) {
        selectors.add(selector);
      }
    }
  }

  return [...selectors];
};

const detectCodeFeatures = (
  bytecode: string,
  profile: OnchainContractProfilePayload,
  implementationAddress: string | null
): OnchainCodeFeaturePayload => {
  const selectors = collectPush4Selectors(bytecode);
  const matchedSelectorLabels = SELECTOR_FEATURES.filter((item) => selectors.includes(item.selector)).map(
    (item) => item.label
  );
  const detectedFeatures = new Set<string>();

  if (profile.detectedInterfaces.includes("erc20_like")) {
    detectedFeatures.add("ERC20-like");
  }
  if (profile.detectedInterfaces.includes("ownable_like")) {
    detectedFeatures.add("Ownable-like");
  }
  if (profile.detectedInterfaces.includes("proxy_like") || implementationAddress) {
    detectedFeatures.add("Proxy-like");
  }
  if (matchedSelectorLabels.some((item) => item.startsWith("mint("))) {
    detectedFeatures.add("Mint-capable");
  }
  if (matchedSelectorLabels.some((item) => item.startsWith("burn("))) {
    detectedFeatures.add("Burn-capable");
  }
  if (matchedSelectorLabels.includes("pause()") || matchedSelectorLabels.includes("unpause()")) {
    detectedFeatures.add("Pausable-like");
  }
  if (
    matchedSelectorLabels.includes("factory()") ||
    matchedSelectorLabels.includes("getReserves()") ||
    matchedSelectorLabels.includes("token0()") ||
    matchedSelectorLabels.includes("token1()")
  ) {
    detectedFeatures.add("LP / Pair-like");
  }

  const bytecodeLength = Math.max(0, (bytecode.replace(/^0x/, "").length / 2) | 0);
  const selectorCount = selectors.length;

  let codeShape: OnchainCodeFeaturePayload["codeShape"] = "non_standard";
  if (profile.detectedInterfaces.includes("erc20_like") && detectedFeatures.size <= 2) {
    codeShape = "standard_like";
  } else if (profile.detectedInterfaces.includes("erc20_like") || detectedFeatures.size >= 3) {
    codeShape = "standard_extended";
  }

  let complexityHint: OnchainCodeFeaturePayload["complexityHint"] = "low";
  if (bytecodeLength > 12000 || selectorCount > 80) {
    complexityHint = "high";
  } else if (bytecodeLength > 5000 || selectorCount > 30) {
    complexityHint = "medium";
  }

  const featureReason =
    detectedFeatures.size > 0
      ? `检测到 ${[...detectedFeatures].join("、")} 等代码特征，当前更像 ${codeShape === "standard_like" ? "标准型" : codeShape === "standard_extended" ? "标准扩展型" : "非标准型"} 合约。`
      : "当前只完成了基础选择器扫描，尚未检测到足够强的标准化代码特征。";

  return {
    bytecodeLength,
    selectorCount,
    detectedFeatures: [...detectedFeatures],
    matchedSelectors: matchedSelectorLabels,
    codeShape,
    complexityHint,
    featureReason,
    boundaryNote: "这是一层轻量级代码特征检测，不代表安全审计、源码审查或完整漏洞分析。"
  };
};

const safeEthCall = async (
  rpcUrl: string,
  to: string,
  data: string
): Promise<{ ok: true; result: string | undefined } | { ok: false; error: string }> => {
  try {
    const payload = await callRpc<string>(rpcUrl, "eth_call", [{ to, data }, "latest"]);
    if (payload.error) {
      return { ok: false, error: payload.error.message };
    }
    return { ok: true, result: payload.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
};

const detectContractProfile = async (
  rpcUrl: string,
  contractAddress: string,
  chainKey: string,
  chainLabel: string,
  latestBlock: string,
  hasCode: boolean,
  nativeBalance: string
): Promise<OnchainContractProfilePayload> => {
  const nameCall = await safeEthCall(rpcUrl, contractAddress, "0x06fdde03");
  const symbolCall = await safeEthCall(rpcUrl, contractAddress, "0x95d89b41");
  const decimalsCall = await safeEthCall(rpcUrl, contractAddress, "0x313ce567");
  const totalSupplyCall = await safeEthCall(rpcUrl, contractAddress, "0x18160ddd");
  const ownerCall = await safeEthCall(rpcUrl, contractAddress, "0x8da5cb5b");

  let implementationAddress: string | null = null;
  try {
    const storagePayload = await callRpc<string>(rpcUrl, "eth_getStorageAt", [
      contractAddress,
      EIP1967_IMPLEMENTATION_SLOT,
      "latest"
    ]);
    if (!storagePayload.error) {
      implementationAddress = decodeAddressResponse(storagePayload.result);
    }
  } catch {
    implementationAddress = null;
  }

  const name = nameCall.ok ? decodeStringResponse(nameCall.result) : null;
  const symbol = symbolCall.ok ? decodeStringResponse(symbolCall.result) : null;
  const decimals = decimalsCall.ok ? decodeUintResponse(decimalsCall.result) : null;
  const totalSupply = totalSupplyCall.ok ? decodeUintResponse(totalSupplyCall.result) : null;
  const owner = ownerCall.ok ? decodeAddressResponse(ownerCall.result) : null;

  const detectedInterfaces: string[] = [];
  if (name || symbol || decimals || totalSupply) {
    detectedInterfaces.push("erc20_like");
  }
  if (owner) {
    detectedInterfaces.push("ownable_like");
  }
  if (implementationAddress) {
    detectedInterfaces.push("proxy_like");
  }

  return {
    chainKey,
    chainLabel,
    latestBlock,
    hasCode,
    nativeBalance,
    tokenMetadata: {
      name,
      symbol,
      decimals,
      totalSupply
    },
    ownership: {
      owner
    },
    proxy: {
      implementationAddress
    },
    detectedInterfaces
  };
};

const inferRoleByRules = (profile: OnchainContractProfilePayload, contractRoleHint?: string | null) => {
  if (contractRoleHint?.trim()) {
    return {
      roleGuess: contractRoleHint.trim(),
      confidence: "medium" as const,
      reason: `已使用人工备注“${contractRoleHint.trim()}”作为当前合约角色参考。`,
      nextStepHint: "如需更高置信度，可继续进入交易、持有人或事件层分析。",
      analysisMode: "rule_fallback" as const
    };
  }

  if (profile.proxy.implementationAddress) {
    return {
      roleGuess: "Proxy / Implementation",
      confidence: "high" as const,
      reason: "检测到 EIP-1967 implementation 槽位，当前合约更像代理或实现合约结构的一部分。",
      nextStepHint: "下一步可继续读取实现合约并确认业务角色。",
      analysisMode: "rule_fallback" as const
    };
  }

  if (profile.tokenMetadata.symbol && profile.tokenMetadata.decimals && profile.tokenMetadata.totalSupply) {
    return {
      roleGuess: "Token",
      confidence: "high" as const,
      reason: "检测到典型 ERC20 元数据接口（symbol / decimals / totalSupply），更像 Token 合约。",
      nextStepHint: "下一步可进入持有人分布、转账活跃度和流动性分析。",
      analysisMode: "rule_fallback" as const
    };
  }

  if (profile.ownership.owner) {
    return {
      roleGuess: "Vault / Treasury",
      confidence: "low" as const,
      reason: "检测到 owner 接口，但暂未检测到典型 Token 元数据，当前更像受控管理型合约。",
      nextStepHint: "下一步可继续读取关键方法或事件，确认它是否承担金库、分发或管理职能。",
      analysisMode: "rule_fallback" as const
    };
  }

  return {
    roleGuess: "Unknown",
    confidence: "low" as const,
    reason: "当前仅完成基础接口探测，尚未发现足够强的标准接口信号来稳定判断合约角色。",
    nextStepHint: "下一步可继续扩展接口探测或结合项目文档、交易行为来判断角色。",
    analysisMode: "rule_fallback" as const
  };
};

const inferRoleWithLlm = async (
  repoRoot: string,
  contractAddress: string,
  profile: OnchainContractProfilePayload,
  contractRoleHint?: string | null
): Promise<OnchainRoleAssessmentPayload> => {
  const config = loadLlmRuntimeConfig(repoRoot);
  if (!config) {
    return inferRoleByRules(profile, contractRoleHint);
  }

  const system = [
    "你是一个谨慎的 EVM 合约角色识别助手。",
    "你只根据给定的规则探测结果判断合约更像承担什么角色。",
    "只能在以下角色里选择一个：Token, Router / Swap, Staking / Farm, Vault / Treasury, NFT, Proxy / Implementation, Unknown。",
    "输出必须是 JSON，对象字段为 roleGuess, confidence, reason, nextStepHint。",
    "confidence 只能是 low, medium, high。"
  ].join("\n");

  const user = JSON.stringify(
    {
      contractAddress,
      contractRoleHint: contractRoleHint ?? null,
      profile
    },
    null,
    2
  );

  try {
    const raw = await createChatCompletion(
      config,
      [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    );
    const parsed = JSON.parse(raw) as Partial<OnchainRoleAssessmentPayload>;
    const roleGuess = parsed.roleGuess ?? "Unknown";
    const confidence = parsed.confidence ?? "low";
    const reason = parsed.reason ?? "模型未返回稳定理由，已按保守逻辑回退。";
    const nextStepHint = parsed.nextStepHint ?? "可继续进入更深的链上交互层分析。";

    return {
      roleGuess,
      confidence,
      reason,
      nextStepHint,
      analysisMode: "remote_llm"
    };
  } catch {
    return inferRoleByRules(profile, contractRoleHint);
  }
};

const insertEvidence = (
  db: DatabaseSync,
  params: {
    taskId: string;
    sourceId: string;
    evidenceType: string;
    title: string;
    summary: string;
    rawContent: unknown;
    credibilityLevel: "high" | "medium" | "low";
    capturedAt: string;
  }
) => {
  db.prepare(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    params.taskId,
    params.sourceId,
    params.evidenceType,
    params.title,
    params.summary,
    JSON.stringify(params.rawContent),
    params.credibilityLevel,
    params.capturedAt,
    params.capturedAt
  );
};

export const collectOnchain = async (db: DatabaseSync, repoRoot: string, taskId: string) => {
  const env = loadRepoEnv(repoRoot);
  const contractSources = db
    .prepare(`SELECT id, source_url FROM sources WHERE task_id = ? AND source_type = 'contract'`)
    .all(taskId) as unknown as ContractSourceRow[];
  const onchainContexts = db
    .prepare(`SELECT source_id, chain_key, chain_label, contract_role_hint FROM onchain_source_contexts WHERE task_id = ?`)
    .all(taskId) as unknown as OnchainContextRow[];

  const collectedContracts: string[] = [];
  const skippedContracts: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();

  if (contractSources.length === 0) {
    warnings.push("当前任务没有合约来源，无法执行链上基础识别。");
    return {
      taskId,
      collectedContracts,
      skippedContracts,
      warnings,
      evidenceCount
    };
  }

  for (const source of contractSources) {
    const context = onchainContexts.find((item) => item.source_id === source.id);
    const chainKey = context?.chain_key ?? env.ONCHAIN_CHAIN_LABEL?.trim() ?? "ethereum";
    const chainLabel = context?.chain_label ?? chainKey;
    const rpcEnvKey = CHAIN_RPC_ENV_KEYS[chainKey];
    const rpcUrl = (rpcEnvKey ? env[rpcEnvKey] : undefined)?.trim() ?? env.ONCHAIN_RPC_URL?.trim();

    if (!rpcUrl) {
      skippedContracts.push(source.source_url);
      warnings.push(`${chainLabel} 还没有配置可用 RPC，当前无法采集合约 ${source.source_url}。`);
      continue;
    }

    let latestBlockSummary = "unknown";
    try {
      const latestBlock = await callRpc<string>(rpcUrl, "eth_blockNumber", []);
      if (latestBlock.error) {
        warnings.push(`${chainLabel} 最新区块读取失败：${latestBlock.error.message}`);
      } else if (latestBlock.result) {
        latestBlockSummary = hexToDecimalString(latestBlock.result);
      }
    } catch (error) {
      warnings.push(`${chainLabel} 最新区块探测失败：${error instanceof Error ? error.message : "unknown_error"}`);
    }

    try {
      const payload = await callRpc<string>(rpcUrl, "eth_getCode", [source.source_url, "latest"]);
      if (payload.error) {
        skippedContracts.push(source.source_url);
        warnings.push(`${chainLabel} 合约代码读取失败 ${source.source_url}: ${payload.error.message}`);
        continue;
      }

      const bytecode = payload.result ?? "0x";
      const hasCode = bytecode !== "0x";
      let balanceSummary = "unknown";

      try {
        const balancePayload = await callRpc<string>(rpcUrl, "eth_getBalance", [source.source_url, "latest"]);
        if (balancePayload.error) {
          warnings.push(`${chainLabel} 原生币余额读取失败 ${source.source_url}: ${balancePayload.error.message}`);
        } else if (balancePayload.result) {
          balanceSummary = hexToDecimalString(balancePayload.result);
        }
      } catch (error) {
        warnings.push(`${chainLabel} 原生币余额探测失败 ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      }

      const metricPayload: OnchainMetricPayload = {
        bytecodePreview: bytecode.slice(0, 120),
        latestBlock: latestBlockSummary,
        balance: balanceSummary,
        hasCode
      };

      insertEvidence(db, {
        taskId,
        sourceId: source.id,
        evidenceType: "onchain_metric",
        title: `链上基础识别：${source.source_url}`,
        summary: hasCode
          ? `已在 ${chainLabel} 上识别到合约代码；最新区块 ${latestBlockSummary}；原生币余额 ${balanceSummary}。`
          : `在 ${chainLabel} 上未识别到合约代码；最新区块 ${latestBlockSummary}；原生币余额 ${balanceSummary}。`,
        rawContent: metricPayload,
        credibilityLevel: "high",
        capturedAt: now
      });
      evidenceCount += 1;

      if (hasCode) {
        const profile = await detectContractProfile(
          rpcUrl,
          source.source_url,
          chainKey,
          chainLabel,
          latestBlockSummary,
          hasCode,
          balanceSummary
        );
        const codeFeatures = detectCodeFeatures(bytecode, profile, profile.proxy.implementationAddress);
        const roleAssessment = await inferRoleWithLlm(repoRoot, source.source_url, profile, context?.contract_role_hint);

        insertEvidence(db, {
          taskId,
          sourceId: source.id,
          evidenceType: "onchain_contract_profile",
          title: `合约规则探测：${source.source_url}`,
          summary:
            profile.detectedInterfaces.length > 0
              ? `已完成规则探测；识别到 ${profile.detectedInterfaces.join("、")} 等接口特征。`
              : "已完成规则探测，但暂未识别到明显的标准接口特征。",
          rawContent: profile,
          credibilityLevel: "high",
          capturedAt: now
        });
        evidenceCount += 1;

        insertEvidence(db, {
          taskId,
          sourceId: source.id,
          evidenceType: "onchain_code_features",
          title: `代码特征检测：${source.source_url}`,
          summary: codeFeatures.featureReason,
          rawContent: codeFeatures,
          credibilityLevel: "high",
          capturedAt: now
        });
        evidenceCount += 1;

        insertEvidence(db, {
          taskId,
          sourceId: source.id,
          evidenceType: "onchain_role_assessment",
          title: `合约角色识别：${source.source_url}`,
          summary: `${roleAssessment.roleGuess}（置信度：${roleAssessment.confidence}）`,
          rawContent: roleAssessment,
          credibilityLevel: roleAssessment.analysisMode === "remote_llm" ? "medium" : "high",
          capturedAt: now
        });
        evidenceCount += 1;
      }

      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
      collectedContracts.push(source.source_url);
    } catch (error) {
      skippedContracts.push(source.source_url);
      warnings.push(`${chainLabel} RPC 读取失败 ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }

  recordCollectionRun(db, {
    taskId,
    collectorKey: "onchain_rpc_provider",
    sourceType: "onchain",
    status: evidenceCount > 0 && skippedContracts.length === 0 ? "completed" : evidenceCount > 0 ? "partial" : "failed",
    collectedCount: collectedContracts.length,
    skippedCount: skippedContracts.length,
    evidenceCount,
    warnings
  });

  return {
    taskId,
    collectedContracts,
    skippedContracts,
    warnings,
    evidenceCount
  };
};
