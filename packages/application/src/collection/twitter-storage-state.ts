import path from "node:path";
import { loadRepoEnv } from "../config/load-env.js";

export const resolveTwitterStorageStatePath = (repoRoot: string): string => {
  const env = loadRepoEnv(repoRoot);
  const fromEnv = env.TWITTER_STORAGE_STATE_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(repoRoot, fromEnv);
  }
  return path.join(repoRoot, "data", "local", "twitter-storage-state.json");
};
