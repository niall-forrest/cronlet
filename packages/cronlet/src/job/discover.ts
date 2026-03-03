import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { JobDefinition } from "./types.js";
import { registry } from "./registry.js";

/**
 * Options for job discovery
 */
export interface DiscoverOptions {
  /** Directory to scan for job files (defaults to auto-detect) */
  directory?: string;
  /** File extensions to include (defaults to [".ts", ".js"]) */
  extensions?: string[];
  /** Whether to clear existing registry before discovering (defaults to true) */
  clearRegistry?: boolean;
}

/**
 * Default directories to search for jobs (in order of preference)
 */
const DEFAULT_DIRECTORIES = ["./jobs", "./src/jobs", "./app/jobs"];

/**
 * Find the jobs directory, checking common locations
 */
function findJobsDirectory(cwd: string): string | null {
  for (const dir of DEFAULT_DIRECTORIES) {
    const fullPath = join(cwd, dir);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Recursively find all files with matching extensions in a directory
 */
function findFiles(
  dir: string,
  extensions: string[],
  files: string[] = []
): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!entry.startsWith(".") && entry !== "node_modules") {
        findFiles(fullPath, extensions, files);
      }
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Convert a file path to a job ID
 * e.g., "/path/to/jobs/billing/sync-stripe.ts" -> "billing/sync-stripe"
 */
function filePathToJobId(filePath: string, baseDir: string): string {
  const relativePath = relative(baseDir, filePath);
  const ext = extname(relativePath);
  return relativePath.slice(0, -ext.length).replace(/\\/g, "/");
}

function hasExplicitName(job: JobDefinition): boolean {
  return typeof job.config.name === "string" && job.config.name.length > 0;
}

function buildNormalizedJob(
  job: JobDefinition,
  filePath: string,
  fileJobId: string
): JobDefinition {
  if (hasExplicitName(job)) {
    const name = job.config.name!;
    return {
      ...job,
      id: name,
      name,
      filePath,
    };
  }

  // schedule() uses anonymous-job-* IDs when no explicit name is provided.
  // During discovery we normalize those IDs to stable file-based IDs.
  if (job.id.startsWith("anonymous-job-")) {
    return {
      ...job,
      id: fileJobId,
      name: fileJobId,
      filePath,
    };
  }

  return {
    ...job,
    filePath,
  };
}

function createJobConflictError(
  jobId: string,
  filePath: string,
  existing: JobDefinition
): Error {
  const existingPath = existing.filePath ?? "(unknown source)";
  return new Error(
    `Job ID conflict for "${jobId}": ${filePath} conflicts with ${existingPath}. ` +
      `Use config.name to disambiguate.`
  );
}

function syncRegistryJob(
  importedJob: JobDefinition,
  normalizedJob: JobDefinition,
  filePath: string
): JobDefinition {
  const existingAtTargetId = registry.getById(normalizedJob.id);
  if (existingAtTargetId) {
    if (existingAtTargetId === importedJob) {
      existingAtTargetId.filePath = filePath;
      existingAtTargetId.name = normalizedJob.name;
      return existingAtTargetId;
    }
    throw createJobConflictError(normalizedJob.id, filePath, existingAtTargetId);
  }

  const existingAtImportedId = registry.getById(importedJob.id);
  if (existingAtImportedId === importedJob && importedJob.id !== normalizedJob.id) {
    registry.remove(importedJob.id);
  }

  registry.register(normalizedJob);
  return normalizedJob;
}

/**
 * Import a job file and extract the job definition
 */
async function importJobFile(
  filePath: string,
  fileJobId: string
): Promise<JobDefinition | null> {
  try {
    // Convert to file URL for ESM import
    // Add timestamp to bust cache for hot reloading
    const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`;

    // Dynamic import
    const module = await import(fileUrl);

    // Get the default export
    const jobDef = module.default;

    if (!jobDef || typeof jobDef !== "object") {
      console.warn(
        `Warning: ${filePath} does not have a valid default export`
      );
      return null;
    }

    // Check if it looks like a JobDefinition
    if (!jobDef.schedule || !jobDef.handler) {
      console.warn(
        `Warning: ${filePath} default export is not a valid JobDefinition`
      );
      return null;
    }

    const normalizedJob = buildNormalizedJob(jobDef as JobDefinition, filePath, fileJobId);
    return syncRegistryJob(jobDef as JobDefinition, normalizedJob, filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error importing ${filePath}: ${message}`);
    return null;
  }
}

/**
 * Discover and load all job files from a directory
 *
 * @param options - Discovery options
 * @returns Array of discovered job definitions
 *
 * @example
 * ```ts
 * // Auto-detect directory
 * const jobs = await discoverJobs();
 *
 * // Specify directory
 * const jobs = await discoverJobs({ directory: "./src/jobs" });
 * ```
 */
export async function discoverJobs(
  options: DiscoverOptions = {}
): Promise<JobDefinition[]> {
  const {
    directory,
    extensions = [".ts", ".js"],
    clearRegistry = true,
  } = options;

  // Clear existing registry if requested
  if (clearRegistry) {
    registry.clear();
  }

  // Find the jobs directory
  const cwd = process.cwd();
  const jobsDir = directory
    ? join(cwd, directory)
    : findJobsDirectory(cwd);

  if (!jobsDir) {
    console.warn(
      "No jobs directory found. Looked in: " +
        DEFAULT_DIRECTORIES.join(", ")
    );
    return [];
  }

  if (!existsSync(jobsDir)) {
    console.warn(`Jobs directory does not exist: ${jobsDir}`);
    return [];
  }

  // Find all job files
  const files = findFiles(jobsDir, extensions);

  if (files.length === 0) {
    console.warn(`No job files found in ${jobsDir}`);
    return [];
  }

  // Import and process each file
  const jobs: JobDefinition[] = [];

  for (const filePath of files) {
    const jobId = filePathToJobId(filePath, jobsDir);
    const job = await importJobFile(filePath, jobId);

    if (job) {
      jobs.push(job);
    }
  }

  return jobs;
}

/**
 * Get the list of default directories that discoverJobs checks
 */
export function getDefaultDirectories(): string[] {
  return [...DEFAULT_DIRECTORIES];
}
