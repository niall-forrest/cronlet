import type { Tool, ToolContext } from "./types.js";

export const slackPost: Tool = {
  name: "slack.post",
  description: "Post a message to a Slack channel",

  async execute(args: Record<string, unknown>, ctx: ToolContext) {
    const channel = String(args.channel);
    const text = String(args.text ?? args.message ?? "");
    const blocks = args.blocks as unknown[] | undefined;

    // Get Slack token from secrets
    const secretName = String(args.secretName ?? "SLACK_TOKEN");
    const token = await ctx.getSecret(secretName);

    const payload: Record<string, unknown> = {
      channel,
      text,
    };

    if (blocks) {
      payload.blocks = blocks;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: ctx.signal,
    });

    const result = await response.json() as Record<string, unknown>;

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return {
      ok: true,
      channel: result.channel,
      ts: result.ts,
    };
  },
};
