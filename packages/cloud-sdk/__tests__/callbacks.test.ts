import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCallbackSignature } from "../src/index";

function signedHeaders(timestamp: string, rawBody: string, secret: string): Headers {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  const signature = `v1=${hmac.digest("hex")}`;

  return new Headers({
    "x-cronlet-timestamp": timestamp,
    "x-cronlet-signature": signature,
  });
}

describe("callback signature verification", () => {
  it("accepts a valid signed callback payload", () => {
    const rawBody = JSON.stringify({ event: "task.run.completed" });
    const timestamp = "1710000000";
    const secret = "crsig_test_secret";

    expect(
      verifyCallbackSignature({
        rawBody,
        secret,
        headers: signedHeaders(timestamp, rawBody, secret),
        now: Number(timestamp) * 1000,
      })
    ).toEqual({ ok: true });
  });

  it("rejects invalid signatures and stale timestamps", () => {
    const rawBody = JSON.stringify({ event: "task.run.completed" });
    const secret = "crsig_test_secret";

    expect(
      verifyCallbackSignature({
        rawBody,
        secret,
        headers: new Headers({
          "x-cronlet-timestamp": "1710000000",
          "x-cronlet-signature": "v1=invalid",
        }),
        now: 1710000000 * 1000,
      })
    ).toMatchObject({ ok: false, error: "Invalid callback signature" });

    expect(
      verifyCallbackSignature({
        rawBody,
        secret,
        headers: signedHeaders("1710000000", rawBody, secret),
        now: 1710000601 * 1000,
      })
    ).toMatchObject({ ok: false, error: "Callback timestamp outside tolerance window" });
  });
});
