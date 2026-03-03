import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

function assertContains(text, needle, context) {
  if (!text.includes(needle)) {
    throw new Error(`Expected output to include "${needle}" (${context}).\n\nOutput:\n${text}`);
  }
}

function runCli(cliBin, cwd, args, expectedCode = 0) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== expectedCode) {
    throw new Error(
      `Command failed (${args.join(" ")}) in ${cwd}.\nExpected exit: ${expectedCode}\nActual exit: ${result.status}\n\n${output}`
    );
  }

  return output;
}

function stageFixture(fixturesRoot, tempRoot, name) {
  const src = join(fixturesRoot, name);
  const dest = join(tempRoot, name);
  cpSync(src, dest, { recursive: true });
  return dest;
}

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = resolve(scriptDir, "..", "..");
const cliBin = join(repoRoot, "packages", "cronlet-cli", "dist", "cli.js");
const fixturesRoot = join(repoRoot, "tests", "fixtures", "cli");

if (!existsSync(cliBin)) {
  console.error("Missing CLI build artifact at packages/cronlet-cli/dist/cli.js");
  console.error("Run `pnpm build` before running fixture smoke tests.");
  process.exit(1);
}

const tempRoot = mkdtempSync(join(tmpdir(), "cronlet-cli-smoke-"));

try {
  const basicProject = stageFixture(fixturesRoot, tempRoot, "basic-app");
  const configProject = stageFixture(fixturesRoot, tempRoot, "config-jobs-dir");
  const invalidTimeoutProject = stageFixture(fixturesRoot, tempRoot, "invalid-timeout");

  // list: should show stable file-based IDs
  const listOutput = runCli(cliBin, basicProject, ["list"]);
  assertContains(listOutput, "weekly-digest", "list should include top-level job ID");
  assertContains(listOutput, "billing/sync-stripe", "list should include nested file-based job ID");
  assertContains(listOutput, "finance/month-end-close", "list should include monthly fixture job");

  // run: should execute known job successfully
  const runOutput = runCli(cliBin, basicProject, ["run", "billing/sync-stripe"]);
  assertContains(runOutput, "Completed successfully", "run should succeed for known job ID");

  // run: unknown job should fail with helpful error
  const missingRunOutput = runCli(cliBin, basicProject, ["run", "does-not-exist"], 1);
  assertContains(missingRunOutput, 'Error: Job "does-not-exist" not found', "missing job should fail");

  // validate: should accept ms-based durations
  const validateOutput = runCli(cliBin, basicProject, ["validate"]);
  assertContains(validateOutput, "All 3 jobs valid", "validate should pass for valid fixture");

  // deploy dry-run: should run without writing files and include portability warning for L suffix
  const deployOutput = runCli(cliBin, basicProject, ["deploy", "--platform", "vercel", "--dry-run"]);
  assertContains(deployOutput, "Dry run — no files will be written", "deploy should acknowledge dry-run");
  assertContains(deployOutput, '"L" suffix', "deploy should warn about L suffix portability");
  assertContains(deployOutput, "Run without --dry-run to apply changes.", "deploy should print next step");

  // config jobsDir: should be honored without passing --dir
  const configListOutput = runCli(cliBin, configProject, ["list"]);
  assertContains(configListOutput, "ops/heartbeat", "list should use jobsDir from config");

  // validate should fail for invalid timeout format
  const invalidValidateOutput = runCli(cliBin, invalidTimeoutProject, ["validate"], 1);
  assertContains(invalidValidateOutput, "Invalid timeout format", "validate should fail invalid timeout");
  assertContains(
    invalidValidateOutput,
    "ms|s|m|h|d",
    "validate error should mention supported timeout units"
  );

  console.log("✓ CLI fixture smoke tests passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
