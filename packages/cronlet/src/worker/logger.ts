import type { Logger } from "./types.js";

export function createDefaultLogger(): Logger {
  return {
    info: (msg) => console.log(`[cronlet] ${msg}`),
    error: (msg) => console.error(`[cronlet] ${msg}`),
    warn: (msg) => console.warn(`[cronlet] ${msg}`),
  };
}
