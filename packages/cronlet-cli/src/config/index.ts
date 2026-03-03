import { existsSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { CronletConfig } from "cronlet";

const CONFIG_FILES = [
  "cronlet.config.ts",
  "cronlet.config.mts",
  "cronlet.config.cts",
  "cronlet.config.js",
  "cronlet.config.mjs",
  "cronlet.config.cjs",
] as const;

export const DEFAULT_JOB_DIRECTORIES = [
  "./jobs",
  "./src/jobs",
  "./app/jobs",
] as const;

export interface LoadedConfig {
  config: CronletConfig | null;
  path: string | null;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeConfig(raw: unknown): CronletConfig | null {
  if (!isRecord(raw)) {
    return null;
  }

  const normalized: CronletConfig = {};

  if (typeof raw.jobsDir === "string") {
    normalized.jobsDir = raw.jobsDir;
  }

  if (isRecord(raw.deploy)) {
    normalized.deploy = {};

    if (typeof raw.deploy.prefix === "string") {
      normalized.deploy.prefix = raw.deploy.prefix;
    }

    if (isRecord(raw.deploy.vercel)) {
      normalized.deploy.vercel = {};
      if (typeof raw.deploy.vercel.maxDuration === "number") {
        normalized.deploy.vercel.maxDuration = raw.deploy.vercel.maxDuration;
      }
    }
  }

  return normalized;
}

function shouldUseJiti(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".ts" || ext === ".mts" || ext === ".cts";
}

async function loadWithImport(filePath: string): Promise<unknown> {
  const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
  const mod = await import(url);
  return mod.default ?? mod;
}

async function loadWithJiti(filePath: string): Promise<unknown> {
  const { default: createJITI } = await import("jiti");
  const jiti = createJITI(import.meta.url, {
    interopDefault: true,
    requireCache: false,
  });
  return await jiti.import(filePath, {});
}

function normalizeDirectoryPath(directory: string, rootDir: string): string {
  if (!isAbsolute(directory)) {
    return directory;
  }

  const relPath = relative(rootDir, directory);
  return relPath === "" ? "." : relPath;
}

export function findJobsDirectory(rootDir: string = process.cwd()): string | null {
  for (const candidate of DEFAULT_JOB_DIRECTORIES) {
    if (existsSync(join(rootDir, candidate))) {
      return candidate;
    }
  }

  return null;
}

export function resolveJobsDirectory(
  cliDirectory: string | undefined,
  config: CronletConfig | null,
  rootDir: string = process.cwd()
): string | undefined {
  const resolved = cliDirectory ?? config?.jobsDir ?? findJobsDirectory(rootDir) ?? undefined;
  if (!resolved) {
    return undefined;
  }
  return normalizeDirectoryPath(resolved, rootDir);
}

export async function loadConfig(rootDir: string = process.cwd()): Promise<LoadedConfig> {
  const warnings: string[] = [];

  for (const fileName of CONFIG_FILES) {
    const filePath = join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const raw = await loadWithImport(filePath);
      const config = normalizeConfig(raw);
      if (!config) {
        warnings.push(`Ignoring ${fileName}: config must export an object.`);
        continue;
      }
      return {
        config,
        path: fileName,
        warnings,
      };
    } catch (error) {
      if (shouldUseJiti(filePath)) {
        try {
          const raw = await loadWithJiti(filePath);
          const config = normalizeConfig(raw);
          if (!config) {
            warnings.push(`Ignoring ${fileName}: config must export an object.`);
            continue;
          }
          return {
            config,
            path: fileName,
            warnings,
          };
        } catch (jitiError) {
          const message = jitiError instanceof Error ? jitiError.message : String(jitiError);
          warnings.push(`Failed to load ${fileName}: ${message}`);
          continue;
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to load ${fileName}: ${message}`);
    }
  }

  return {
    config: null,
    path: null,
    warnings,
  };
}
