import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { loadRepoEnv } from "../config/load-env.js";

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface SourceRow {
  id: string;
  source_url: string;
}

interface OnchainContextRow {
  chain_key: string;
  chain_label: string;
}

interface CandidateConfig {
  dexLabel: string;
  factory: string;
  quoteTokens: Array<{ address: string; label: string }>;
}

const nowIso = () => new Date().toISOString();

const LP_DISCOVERY_CONFIG: Record<string, CandidateConfig[]> = {
  bsc: [
    {
      dexLabel: "PancakeSwap V2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quoteTokens: [
        { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", label: "WBNB" },
        { address: "0x55d398326f99059ff775485246999027b3197955", label: "USDT" },
        { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", label: "USDC" }
      ]
    }
  ],
  ethereum: [
    {
      dexLabel: "Uniswap V2",
      factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      quoteTokens: [
        { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", label: "WETH" },
        { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", label: "USDT" },
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", label: "USDC" }
      ]
    }
  ],
  polygon: [
    {
      dexLabel: "QuickSwap V2",
      factory: "0x5757371414417b8c6caad45baef941abc7d3ab32",
      quoteTokens: [
        { address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", label: "WMATIC" },
        { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", label: "USDT" },
        { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", label: "USDC" }
      ]
    }
  ],
  avalanche: [
    {
      dexLabel: "Trader Joe V2",
      factory: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10",
      quoteTokens: [
        { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", label: "WAVAX" },
        { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", label: "USDT.e" },
        { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", label: "USDC" }
      ]
    }
  ]
};

const CHAIN_RPC_ENV_KEYS: Record<string, string> = {
  ethereum: "ONCHAIN_RPC_ETHEREUM",
  bsc: "ONCHAIN_RPC_BSC",
  base: "ONCHAIN_RPC_BASE",
  arbitrum: "ONCHAIN_RPC_ARBITRUM",
  polygon: "ONCHAIN_RPC_POLYGON",
  optimism: "ONCHAIN_RPC_OPTIMISM",
  avalanche: "ONCHAIN_RPC_AVALANCHE"
};

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

const upsertCandidate = (
  db: DatabaseSync,
  params: {
    taskId: string;
    sourceId: string;
    chainKey: string;
    dexLabel: string;
    quoteTokenLabel: string;
    lpAddress: string;
    confidence: "low" | "medium" | "high";
    rationale: string;
  }
) => {
  const existing = db
    .prepare(`SELECT id, status FROM onchain_lp_candidates WHERE source_id = ? AND lp_address = ?`)
    .get(params.sourceId, params.lpAddress) as { id: string; status: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE onchain_lp_candidates
       SET dex_label = ?, quote_token_label = ?, confidence = ?, rationale = ?, updated_at = ?
       WHERE id = ?`
    ).run(params.dexLabel, params.quoteTokenLabel, params.confidence, params.rationale, nowIso(), existing.id);
    return existing.id;
  }

  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO onchain_lp_candidates (
      id, task_id, source_id, chain_key, dex_label, quote_token_label, lp_address, confidence, rationale, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.taskId,
    params.sourceId,
    params.chainKey,
    params.dexLabel,
    params.quoteTokenLabel,
    params.lpAddress,
    params.confidence,
    params.rationale,
    "pending",
    now,
    now
  );
  return id;
};

export const discoverLpCandidates = async (
  db: DatabaseSync,
  repoRoot: string,
  taskId: string,
  sourceId: string
) => {
  const source = db
    .prepare(`SELECT id, source_url FROM sources WHERE task_id = ? AND id = ? AND source_type = 'contract'`)
    .get(taskId, sourceId) as SourceRow | undefined;
  if (!source) {
    throw new Error("contract_source_not_found");
  }

  const onchainContext = db
    .prepare(`SELECT chain_key, chain_label FROM onchain_source_contexts WHERE task_id = ? AND source_id = ?`)
    .get(taskId, sourceId) as OnchainContextRow | undefined;
  if (!onchainContext) {
    throw new Error("onchain_context_not_found");
  }

  const env = loadRepoEnv(repoRoot);
  const rpcEnvKey = CHAIN_RPC_ENV_KEYS[onchainContext.chain_key];
  const rpcUrl = (rpcEnvKey ? env[rpcEnvKey] : undefined)?.trim() ?? env.ONCHAIN_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error(`rpc_not_configured_for_${onchainContext.chain_key}`);
  }

  const configs = LP_DISCOVERY_CONFIG[onchainContext.chain_key] ?? [];
  if (configs.length === 0) {
    return {
      taskId,
      sourceId,
      chainKey: onchainContext.chain_key,
      chainLabel: onchainContext.chain_label,
      candidates: [] as Array<Record<string, unknown>>,
      warnings: [`${onchainContext.chain_label} 当前还没有配置 LP 候选检索规则。`]
    };
  }

  const candidates: Array<{
    id: string;
    lpAddress: string;
    dexLabel: string;
    quoteTokenLabel: string;
    confidence: "low" | "medium" | "high";
    rationale: string;
    status: string;
  }> = [];
  const warnings: string[] = [];

  for (const config of configs) {
    for (const quoteToken of config.quoteTokens) {
      try {
        const payload = await callRpc<string>(rpcUrl, "eth_call", [
          {
            to: config.factory,
            data: `0xe6a43905${source.source_url.replace(/^0x/, "").padStart(64, "0")}${quoteToken.address.replace(/^0x/, "").padStart(64, "0")}`
          },
          "latest"
        ]);

        if (payload.error) {
          warnings.push(`${config.dexLabel} ${quoteToken.label} 配对读取失败：${payload.error.message}`);
          continue;
        }

        const lpAddress = decodeAddressResponse(payload.result);
        if (!lpAddress) {
          continue;
        }

        const rationale = `在 ${config.dexLabel} 工厂中，已检索到当前合约与 ${quoteToken.label} 的 Pair 地址。`;
        const candidateId = upsertCandidate(db, {
          taskId,
          sourceId,
          chainKey: onchainContext.chain_key,
          dexLabel: config.dexLabel,
          quoteTokenLabel: quoteToken.label,
          lpAddress,
          confidence: quoteToken.label.includes("USDT") || quoteToken.label.includes("USDC") ? "high" : "medium",
          rationale
        });

        candidates.push({
          id: candidateId,
          lpAddress,
          dexLabel: config.dexLabel,
          quoteTokenLabel: quoteToken.label,
          confidence: quoteToken.label.includes("USDT") || quoteToken.label.includes("USDC") ? "high" : "medium",
          rationale,
          status: "pending"
        });
      } catch (error) {
        warnings.push(
          `${config.dexLabel} ${quoteToken.label} 候选检索失败：${error instanceof Error ? error.message : "unknown_error"}`
        );
      }
    }
  }

  return {
    taskId,
    sourceId,
    chainKey: onchainContext.chain_key,
    chainLabel: onchainContext.chain_label,
    candidates,
    warnings
  };
};
