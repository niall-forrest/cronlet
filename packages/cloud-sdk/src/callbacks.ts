import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_CALLBACK_TOLERANCE_SECONDS = 300;

export interface CallbackVerificationResult {
  ok: boolean;
  error?: string;
  deliveryId?: string;
}

export interface VerifyCallbackSignatureInput {
  rawBody: string | Buffer;
  secret: string;
  headers: Headers | Record<string, string | string[] | undefined>;
  toleranceSeconds?: number;
  now?: number | Date;
}

function getHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined>,
  key: string
): string | null {
  if (headers instanceof Headers) {
    return headers.get(key);
  }

  const value = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function expectedSignature(timestamp: string, rawBody: string | Buffer, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(timestamp);
  hmac.update(".");
  hmac.update(rawBody);
  return `v1=${hmac.digest("hex")}`;
}

export function verifyCallbackSignature(input: VerifyCallbackSignatureInput): CallbackVerificationResult {
  const timestamp = getHeaderValue(input.headers, "x-cronlet-timestamp");
  const signature = getHeaderValue(input.headers, "x-cronlet-signature");
  const deliveryId = getHeaderValue(input.headers, "x-cronlet-delivery-id");

  if (!timestamp) {
    return { ok: false, error: "Missing x-cronlet-timestamp header" };
  }

  if (!signature) {
    return { ok: false, error: "Missing x-cronlet-signature header" };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, error: "Invalid callback timestamp" };
  }

  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_CALLBACK_TOLERANCE_SECONDS;
  const nowMs = input.now instanceof Date
    ? input.now.getTime()
    : typeof input.now === "number"
      ? input.now
      : Date.now();
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (ageSeconds > toleranceSeconds) {
    return { ok: false, error: "Callback timestamp outside tolerance window" };
  }

  const expected = expectedSignature(timestamp, input.rawBody, input.secret);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, error: "Invalid callback signature" };
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
    ? { ok: true, deliveryId: deliveryId ?? undefined }
    : { ok: false, error: "Invalid callback signature" };
}

export async function verifyUniqueCallbackDelivery(
  input: VerifyCallbackSignatureInput & {
    hasSeenDeliveryId: (deliveryId: string) => boolean | Promise<boolean>;
    markDeliveryIdSeen: (deliveryId: string) => void | Promise<void>;
  },
): Promise<CallbackVerificationResult> {
  const verification = verifyCallbackSignature(input);
  if (!verification.ok) {
    return verification;
  }

  const deliveryId = verification.deliveryId ?? getHeaderValue(input.headers, "x-cronlet-delivery-id");
  if (!deliveryId) {
    return { ok: false, error: "Missing x-cronlet-delivery-id header" };
  }

  if (await input.hasSeenDeliveryId(deliveryId)) {
    return { ok: false, error: "Duplicate callback delivery", deliveryId };
  }

  await input.markDeliveryIdSeen(deliveryId);
  return { ok: true, deliveryId };
}
