import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ERROR_CODES } from "@cronlet/shared";
import { AppError } from "./errors.js";

const SECRET_PAYLOAD_PREFIX = "enc";
const DEFAULT_DEV_KEY_VERSION = "dev-v1";
const DEFAULT_DEV_KEY_MATERIAL = createHash("sha256")
  .update("cronlet-dev-secret-encryption-key")
  .digest();

interface SecretKey {
  version: string;
  key: Buffer;
}

export interface EncryptedSecretValue {
  encryptedValue: string;
  keyVersion: string;
  rotatedAt: string;
}

function parseConfiguredSecretKeys(raw = process.env.CLOUD_SECRET_ENCRYPTION_KEYS): SecretKey[] {
  if (!raw) {
    return [{
      version: DEFAULT_DEV_KEY_VERSION,
      key: DEFAULT_DEV_KEY_MATERIAL,
    }];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [version, encodedKey] = entry.split(":", 2);
      if (!version || !encodedKey) {
        throw new AppError(500, ERROR_CODES.SECRET_ENCRYPTION_CONFIG_INVALID, "Invalid secret encryption key configuration");
      }

      const key = Buffer.from(encodedKey, "base64");
      if (key.length !== 32) {
        throw new AppError(500, ERROR_CODES.SECRET_ENCRYPTION_CONFIG_INVALID, `Secret encryption key '${version}' must decode to 32 bytes`);
      }

      return { version, key };
    });
}

function activeSecretKey(): SecretKey {
  const keys = parseConfiguredSecretKeys();
  const latest = keys.at(-1);
  if (!latest) {
    throw new AppError(500, ERROR_CODES.SECRET_ENCRYPTION_CONFIG_INVALID, "No secret encryption key configured");
  }
  return latest;
}

function findSecretKey(version: string): SecretKey | null {
  return parseConfiguredSecretKeys().find((key) => key.version === version) ?? null;
}

export function encryptSecretValue(plaintext: string, rotatedAt = new Date().toISOString()): EncryptedSecretValue {
  const key = activeSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: [
      SECRET_PAYLOAD_PREFIX,
      key.version,
      iv.toString("base64"),
      authTag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":"),
    keyVersion: key.version,
    rotatedAt,
  };
}

export function decryptSecretValue(
  encryptedValue: string,
  keyVersion?: string | null,
): {
  plaintext: string;
  keyVersion: string;
  legacy: boolean;
} {
  const parts = encryptedValue.split(":");
  if (parts[0] !== SECRET_PAYLOAD_PREFIX) {
    return {
      plaintext: encryptedValue,
      keyVersion: keyVersion ?? "legacy",
      legacy: true,
    };
  }

  const [prefix, payloadVersion, ivB64, authTagB64, ciphertextB64] = parts;
  if (!prefix || !payloadVersion || !ivB64 || !authTagB64 || !ciphertextB64) {
    throw new AppError(500, ERROR_CODES.SECRET_DECRYPTION_FAILED, "Encrypted secret payload is malformed");
  }

  const key = findSecretKey(payloadVersion);
  if (!key) {
    throw new AppError(500, ERROR_CODES.SECRET_DECRYPTION_FAILED, `Missing secret encryption key version '${payloadVersion}'`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key.key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return {
    plaintext,
    keyVersion: payloadVersion,
    legacy: false,
  };
}

export function currentSecretKeyVersion(): string {
  return activeSecretKey().version;
}
