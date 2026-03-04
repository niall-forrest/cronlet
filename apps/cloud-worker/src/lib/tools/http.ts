import type { Tool, ToolContext } from "./types.js";

export const httpGet: Tool = {
  name: "http.get",
  description: "Make an HTTP GET request",

  async execute(args: Record<string, unknown>, ctx: ToolContext) {
    const url = String(args.url);
    const headers = (args.headers as Record<string, string>) ?? {};

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: ctx.signal,
    });

    const body = await response.text();
    let parsedBody: unknown = body;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      // Keep as string
    }

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    return { status: response.status, body: parsedBody, headers: respHeaders };
  },
};

export const httpPost: Tool = {
  name: "http.post",
  description: "Make an HTTP POST request",

  async execute(args: Record<string, unknown>, ctx: ToolContext) {
    const url = String(args.url);
    const headers = (args.headers as Record<string, string>) ?? {};
    const bodyContent = args.body;

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(bodyContent),
      signal: ctx.signal,
    });

    const respBody = await response.text();
    let parsedBody: unknown = respBody;
    try {
      parsedBody = JSON.parse(respBody);
    } catch {
      // Keep as string
    }

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    return { status: response.status, body: parsedBody, headers: respHeaders };
  },
};
