import path from "node:path";
import { loadRepoEnv } from "../config/load-env.js";

export const resolveTwitterBrowserUserDataDir = (repoRoot: string): string => {
  const env = loadRepoEnv(repoRoot);
  const fromEnv = env.TWITTER_BROWSER_USER_DATA_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(repoRoot, fromEnv);
  }
  return path.join(repoRoot, "data", "local", "twitter-chrome-profile");
};
