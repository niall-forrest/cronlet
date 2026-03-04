import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CloudAuthConfig {
  apiUrl: string;
  apiKey: string;
}

const CLOUD_DIR = ".cronlet";
const AUTH_FILE = "cloud-auth.json";

function ensureCloudDir(): string {
  const dir = join(process.cwd(), CLOUD_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadCloudAuth(): CloudAuthConfig | null {
  const path = join(process.cwd(), CLOUD_DIR, AUTH_FILE);
  return readJsonFile<CloudAuthConfig>(path);
}

export function saveCloudAuth(config: CloudAuthConfig): string {
  const dir = ensureCloudDir();
  const path = join(dir, AUTH_FILE);
  writeJsonFile(path, config);
  return path;
}
