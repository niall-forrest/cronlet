import type { Tool } from "./types.js";

export const log: Tool = {
  name: "log",
  description: "Log a message to the run output",

  async execute(args: Record<string, unknown>) {
    const message = String(args.message ?? "");
    const level = String(args.level ?? "info");
    console.log(`[${level}] ${message}`);
    return { logged: true, message, level };
  },
};

export const sleep: Tool = {
  name: "sleep",
  description: "Wait for a specified number of seconds",

  async execute(args: Record<string, unknown>) {
    const seconds = Number(args.seconds ?? 1);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { slept: seconds };
  },
};
