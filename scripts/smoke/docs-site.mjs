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
  "getting-started/index.html",
  "jobs-and-scheduling-model/index.html",
  "config-reference/index.html",
  "cli-commands/index.html",
  "local-dev-and-hot-reload/index.html",
  "deploy-targets-and-caveats/index.html",
  "troubleshooting-and-faq/index.html",
];

for (const page of requiredPages) {
  assertFileExists(join(distDir, page));
}

const sitemapPath = join(distDir, "sitemap-index.xml");
assertFileExists(sitemapPath);

const sitemap = readFileSync(sitemapPath, "utf8");
assertIncludes(sitemap, "https://docs.cronlet.dev", "sitemap");

console.log("✓ Docs smoke checks passed");
