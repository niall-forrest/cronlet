import type { FastifyInstance, FastifyReply } from "fastify";

/**
 * SSE client connection
 */
export interface SSEClient {
  id: string;
  reply: FastifyReply;
  send: (data: unknown) => void;
}

let clientIdCounter = 0;

/**
 * Setup SSE endpoint on Fastify instance
 */
export function setupSSE(
  fastify: FastifyInstance,
  clients: Set<SSEClient>
): void {
  fastify.get("/api/events", async (request, reply) => {
    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const clientId = `client_${++clientIdCounter}`;

    const client: SSEClient = {
      id: clientId,
      reply,
      send: (data: unknown) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Client disconnected
          clients.delete(client);
        }
      },
    };

    clients.add(client);

    // Send initial connected message
    client.send({ type: "connected", clientId });

    // Handle client disconnect
    request.raw.on("close", () => {
      clients.delete(client);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        clients.delete(client);
      }
    }, 30000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
    });

    // Don't return - keep connection open
    await new Promise(() => {});
  });
}
