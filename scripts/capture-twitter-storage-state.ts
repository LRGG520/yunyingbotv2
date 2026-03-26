import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { resolveBrowserExecutablePath } from "../packages/application/src/collection/browser-runtime.js";
import { resolveTwitterStorageStatePath } from "../packages/application/src/collection/twitter-storage-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const executablePath = resolveBrowserExecutablePath(repoRoot);
const storageStatePath = resolveTwitterStorageStatePath(repoRoot);
const userDataDir =
  process.env.TWITTER_BROWSER_USER_DATA_DIR?.trim() || path.join(repoRoot, "data", "local", "twitter-chrome-profile");
const loginUrl = process.env.TWITTER_LOGIN_URL?.trim() || "https://x.com/i/flow/login";
const browserArgs = [
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--start-maximized",
  "--lang=en-US"
];

const main = async () => {
  if (!executablePath) {
    throw new Error(
      "No supported browser executable was found. Set BROWSER_EXECUTABLE_PATH or install Edge/Chrome on the machine running the capture."
    );
  }

  mkdirSync(path.dirname(storageStatePath), { recursive: true });
  mkdirSync(userDataDir, { recursive: true });

  console.log("[twitter-login] Starting headed browser for manual login.");
  console.log(`[twitter-login] Browser: ${executablePath}`);
  console.log(`[twitter-login] Target storage state: ${storageStatePath}`);
  console.log(`[twitter-login] User data dir: ${userDataDir}`);
  console.log(`[twitter-login] Existing state file: ${existsSync(storageStatePath) ? "yes" : "no"}`);
  console.log("[twitter-login] Complete the login in the opened browser, then return here and press Enter.");

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    locale: "en-US",
    viewport: null,
    args: browserArgs
  });

  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const existingPage = context.pages()[0];
    const page = existingPage ?? (await context.newPage());
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const rl = readline.createInterface({ input, output });
    try {
      await rl.question("[twitter-login] Press Enter after the account is fully logged in and the page is stable...");
    } finally {
      rl.close();
    }

    await context.storageState({ path: storageStatePath });
    console.log(`[twitter-login] Storage state saved to ${storageStatePath}`);
  } finally {
    await context.close();
  }
};

void main().catch((error) => {
  console.error("[twitter-login] Capture failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
