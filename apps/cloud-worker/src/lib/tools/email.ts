import type { Tool, ToolContext } from "./types.js";

/**
 * Email tool using Resend API
 * Requires RESEND_API_KEY secret (or custom secretName)
 */
export const emailSend: Tool = {
  name: "email.send",
  description: "Send an email via Resend",

  async execute(args: Record<string, unknown>, ctx: ToolContext) {
    const to = args.to as string | string[];
    const subject = String(args.subject ?? "");
    const text = args.text as string | undefined;
    const html = args.html as string | undefined;
    const from = String(args.from ?? "onboarding@resend.dev");

    // Get API key from secrets
    const secretName = String(args.secretName ?? "RESEND_API_KEY");
    const apiKey = await ctx.getSecret(secretName);

    const payload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ctx.signal,
    });

    const result = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(`Email API error: ${JSON.stringify(result)}`);
    }

    return {
      id: result.id,
      sent: true,
    };
  },
};
