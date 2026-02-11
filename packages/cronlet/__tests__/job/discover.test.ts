import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { discoverJobs, getDefaultDirectories } from "../../src/job/discover.js";
import { registry } from "../../src/job/registry.js";

const TEST_DIR = join(process.cwd(), "__test_jobs__");

describe("discoverJobs()", () => {
  beforeEach(() => {
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns empty array when directory does not exist", async () => {
    const jobs = await discoverJobs({ directory: "./nonexistent-dir-12345" });
    expect(jobs).toEqual([]);
  });

  it("returns empty array when directory has no job files", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, "readme.md"), "not a job file");

    const jobs = await discoverJobs({ directory: "./__test_jobs__" });
    expect(jobs).toEqual([]);
  });

  it("skips files without valid job export", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, "not-a-job.ts"), `export const foo = "bar";`);

    const jobs = await discoverJobs({ directory: "./__test_jobs__" });
    expect(jobs).toEqual([]);
  });

  it("clears registry by default", async () => {
    registry.register({
      id: "existing",
      name: "existing",
      schedule: { type: "interval", cron: "0 * * * *", humanReadable: "every hour", originalParams: {} },
      config: {},
      handler: async () => {},
    });

    mkdirSync(TEST_DIR, { recursive: true });
    await discoverJobs({ directory: "./__test_jobs__" });

    expect(registry.getById("existing")).toBeUndefined();
  });

  it("preserves registry when clearRegistry is false", async () => {
    registry.register({
      id: "existing",
      name: "existing",
      schedule: { type: "interval", cron: "0 * * * *", humanReadable: "every hour", originalParams: {} },
      config: {},
      handler: async () => {},
    });

    mkdirSync(TEST_DIR, { recursive: true });
    await discoverJobs({ directory: "./__test_jobs__", clearRegistry: false });

    expect(registry.getById("existing")).toBeDefined();
  });

  it("handles files with syntax errors gracefully", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, "broken.ts"), `this is not valid javascript {{{`);

    // Should not throw, just return empty
    const jobs = await discoverJobs({ directory: "./__test_jobs__" });
    expect(jobs).toEqual([]);
  });
});

describe("getDefaultDirectories()", () => {
  it("returns default directory list", () => {
    const dirs = getDefaultDirectories();
    expect(dirs).toContain("./jobs");
    expect(dirs).toContain("./src/jobs");
    expect(dirs).toContain("./app/jobs");
  });

  it("returns a copy, not the original array", () => {
    const dirs1 = getDefaultDirectories();
    const dirs2 = getDefaultDirectories();
    expect(dirs1).not.toBe(dirs2);
    expect(dirs1).toEqual(dirs2);
  });
});
