import { createHash } from "node:crypto";
import { nanoid } from "nanoid";

export function createApiKeyToken(): string {
  return `ck_${nanoid(42)}`;
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function keyPreviewFromHash(keyHash: string): string {
  return `ck_${keyHash.slice(0, 8)}...`;
}
