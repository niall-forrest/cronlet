import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findJobsDirectory,
  loadConfig,
  resolveJobsDirectory,
  resolveWatchDirectories,
} from "../src/config/index.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "cronlet-cli-config-"));
}

function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

describe("config loading", () => {
  it("loads config from cronlet.config.mjs", async () => {
    const root = createTempDir();

    try {
      writeFileSync(
        join(root, "cronlet.config.mjs"),
        `export default {
  jobsDir: "./my-jobs",
  deploy: {
    prefix: "/api/scheduled",
    vercel: { maxDuration: 120 }
  }
};`
      );

      const loaded = await loadConfig(root);

      expect(loaded.path).toBe("cronlet.config.mjs");
      expect(loaded.warnings).toEqual([]);
      expect(loaded.config).toEqual({
        jobsDir: "./my-jobs",
        deploy: {
          prefix: "/api/scheduled",
          vercel: { maxDuration: 120 },
        },
      });
    } finally {
      cleanupTempDir(root);
    }
  });

  it("loads config from cronlet.config.cjs", async () => {
    const root = createTempDir();

    try {
      writeFileSync(
        join(root, "cronlet.config.cjs"),
        `module.exports = { jobsDir: "./jobs-cjs" };`
      );

      const loaded = await loadConfig(root);

      expect(loaded.path).toBe("cronlet.config.cjs");
      expect(loaded.config?.jobsDir).toBe("./jobs-cjs");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("returns warning for invalid config export", async () => {
    const root = createTempDir();

    try {
      writeFileSync(join(root, "cronlet.config.cjs"), `module.exports = "oops";`);

      const loaded = await loadConfig(root);

      expect(loaded.config).toBeNull();
      expect(loaded.warnings[0]).toContain("config must export an object");
    } finally {
      cleanupTempDir(root);
    }
  });
});

describe("jobs directory resolution", () => {
  it("finds first existing jobs directory in priority order", () => {
    const root = createTempDir();

    try {
      mkdirSync(join(root, "src/jobs"), { recursive: true });
      mkdirSync(join(root, "app/jobs"), { recursive: true });

      const jobsDir = findJobsDirectory(root);
      expect(jobsDir).toBe("./src/jobs");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("resolves directory with precedence: CLI > config > auto-detect", () => {
    const root = createTempDir();

    try {
      mkdirSync(join(root, "src/jobs"), { recursive: true });

      const fromCli = resolveJobsDirectory("./cli-jobs", { jobsDir: "./config-jobs" }, root);
      expect(fromCli).toBe("./cli-jobs");

      const fromConfig = resolveJobsDirectory(undefined, { jobsDir: "./config-jobs" }, root);
      expect(fromConfig).toBe("./config-jobs");

      const fromAuto = resolveJobsDirectory(undefined, null, root);
      expect(fromAuto).toBe("./src/jobs");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("normalizes absolute jobs directory to a relative path", () => {
    const root = createTempDir();

    try {
      const absoluteJobsPath = join(root, "absolute-jobs");
      const resolved = resolveJobsDirectory(undefined, { jobsDir: absoluteJobsPath }, root);
      expect(resolved).toBe("absolute-jobs");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("resolves watch directories from defaults when no explicit directory is set", () => {
    const root = createTempDir();

    try {
      const watchDirs = resolveWatchDirectories(undefined, null, root);
      expect(watchDirs).toEqual(["./jobs", "./src/jobs", "./app/jobs"]);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("resolves watch directories from config", () => {
    const root = createTempDir();

    try {
      const watchDirs = resolveWatchDirectories(undefined, { jobsDir: "./my-jobs" }, root);
      expect(watchDirs).toEqual(["./my-jobs"]);
    } finally {
      cleanupTempDir(root);
    }
  });
});
