import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";

export interface AuditEventInput {
  organizationId: string;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload?: unknown;
  metadata?: Prisma.InputJsonValue;
}

function hashPayload(payload: unknown): string | null {
  if (payload === undefined) {
    return null;
  }

  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHash("sha256").update(serialized).digest("hex");
}

export async function recordAuditEvent(app: FastifyInstance, input: AuditEventInput): Promise<void> {
  if (!app.prisma) {
    return;
  }

  try {
    await app.prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payloadHash: hashPayload(input.payload),
        metadata: input.metadata,
      },
    });
  } catch (error) {
    app.log.warn(
      {
        error,
        action: input.action,
        organizationId: input.organizationId,
      },
      "Failed to persist audit event"
    );
  }
}
