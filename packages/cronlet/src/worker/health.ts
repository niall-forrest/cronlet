import { createServer, type Server } from "node:http";
import type { JobDefinition } from "../job/types.js";
import type { Logger } from "./types.js";

export interface HealthServer {
  server: Server;
  close(): Promise<void>;
}

export function startHealthServer(
  port: number,
  path: string,
  getJobs: () => JobDefinition[],
  startedAt: Date,
  logger: Logger
): Promise<HealthServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "GET" && req.url === path) {
        const body = JSON.stringify({
          status: "ok",
          jobs: getJobs().length,
          uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(body);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.on("error", reject);

    server.listen(port, "0.0.0.0", () => {
      logger.info(`Health check: http://localhost:${port}${path}`);
      resolve({
        server,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res()))
          ),
      });
    });
  });
}
