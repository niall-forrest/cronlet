/**
 * Verification result from checking a cron request
 */
export interface VerificationResult {
  ok: boolean;
  error?: string;
}

/**
 * Verify that a request is from Vercel Cron (or other authorized source).
 *
 * Checks the Authorization header against the CRON_SECRET environment variable.
 * In development mode (NODE_ENV=development), requests are allowed without verification.
 *
 * @param request - Request object (Web Request API or NextApiRequest-like)
 * @returns Verification result indicating success or failure with error message
 *
 * @example
 * ```ts
 * // In an API route
 * const result = verifyCronRequest(request);
 * if (!result.ok) {
 *   return new Response(result.error, { status: 401 });
 * }
 * ```
 */
export function verifyCronRequest(
  request: Request | { headers: { authorization?: string } }
): VerificationResult {
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow requests without secret for easier testing
  if (process.env.NODE_ENV === "development") {
    return { ok: true };
  }

  if (!cronSecret) {
    return {
      ok: false,
      error: "CRON_SECRET environment variable not set",
    };
  }

  // Handle both Web Request API and NextApiRequest
  let authHeader: string | null | undefined;
  if (request instanceof Request) {
    authHeader = request.headers.get("authorization");
  } else {
    authHeader = request.headers.authorization;
  }

  if (!authHeader) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  if (authHeader !== expectedHeader) {
    return { ok: false, error: "Invalid Authorization header" };
  }

  return { ok: true };
}
