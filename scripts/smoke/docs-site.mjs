import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function assertFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing expected docs output: ${filePath}`);
  }
}

function assertIncludes(text, expected, context) {
  if (!text.includes(expected)) {
    throw new Error(`Expected ${context} to include "${expected}"`);
  }
}

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = resolve(scriptDir, "..", "..");

run("pnpm", ["--filter", "@cronlet/docs", "build"], repoRoot);

const distDir = join(repoRoot, "apps", "docs", "dist");

const requiredPages = [
  "index.html",
  "cloud-quickstart/index.html",
  "sdk-overview/index.html",
  "tasks-handlers-and-schedules/index.html",
  "callbacks-and-agent-loops/index.html",
  "agent-tooling/index.html",
  "sdk-api-reference/index.html",
  "local-runtime-quickstart/index.html",
  "local-runtime-reference/index.html",
];

for (const page of requiredPages) {
  assertFileExists(join(distDir, page));
}

const sitemapPath = join(distDir, "sitemap-index.xml");
assertFileExists(sitemapPath);

const sitemap = readFileSync(sitemapPath, "utf8");
assertIncludes(sitemap, "https://docs.cronlet.dev", "sitemap");

console.log("✓ Docs smoke checks passed");
