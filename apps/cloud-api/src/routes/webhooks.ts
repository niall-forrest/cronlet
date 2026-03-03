import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import type { PlanTier } from "@cronlet/cloud-shared";
import { ERROR_CODES } from "@cronlet/cloud-shared";
import { AppError } from "../lib/errors.js";
import { handleError, ok } from "../lib/http.js";
import { recordAuditEvent } from "../lib/audit.js";

interface ClerkWebhookEvent {
  type?: string;
  data?: Record<string, unknown>;
}

function parsePlanTier(value: unknown): PlanTier | null {
  if (value === "free" || value === "pro" || value === "team") {
    return value;
  }
  return null;
}

function resolvePlanFromEvent(data: Record<string, unknown>): PlanTier | null {
  const candidates = [
    data.plan,
    data.plan_slug,
    data.planSlug,
    data.tier,
    typeof data.public_metadata === "object" && data.public_metadata ? (data.public_metadata as Record<string, unknown>).plan : null,
  ];

  for (const candidate of candidates) {
    const parsed = parsePlanTier(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function isDelinquentStatus(data: Record<string, unknown>): boolean {
  const raw = data.status;
  if (typeof raw !== "string") {
    return false;
  }
  return ["past_due", "unpaid", "canceled", "incomplete_expired"].includes(raw);
}

function resolveOrgId(data: Record<string, unknown>): string | null {
  const direct = data.org_id;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const nestedOrg = data.organization;
  if (typeof nestedOrg === "object" && nestedOrg) {
    const nestedId = (nestedOrg as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.length > 0) {
      return nestedId;
    }
  }

  const id = data.id;
  if (typeof id === "string" && id.startsWith("org_")) {
    return id;
  }

  return null;
}

function resolveOrgFields(data: Record<string, unknown>): { name?: string; slug?: string } {
  const name = typeof data.name === "string" ? data.name : undefined;
  const slug = typeof data.slug === "string" ? data.slug : undefined;
  return { name, slug };
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/webhooks/clerk",
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
    try {
      const rawPayload =
        typeof request.rawBody === "string"
          ? request.rawBody
          : request.rawBody
            ? request.rawBody.toString("utf8")
            : JSON.stringify(request.body ?? {});
      const secret = process.env.CLERK_WEBHOOK_SECRET;

      if (secret) {
        const webhook = new Webhook(secret);
        const svixId = request.headers["svix-id"];
        const svixTimestamp = request.headers["svix-timestamp"];
        const svixSignature = request.headers["svix-signature"];

        if (
          typeof svixId !== "string" ||
          typeof svixTimestamp !== "string" ||
          typeof svixSignature !== "string"
        ) {
          throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Missing Svix headers");
        }

        webhook.verify(rawPayload, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        });
      }

      const payload =
        typeof request.body === "object" && request.body
          ? (request.body as ClerkWebhookEvent)
          : (JSON.parse(rawPayload) as ClerkWebhookEvent);

      const eventType = payload.type ?? "unknown";
      const data = payload.data ?? {};
      const orgId = resolveOrgId(data);

      if (!orgId) {
        return ok(reply, { received: true, ignored: true, reason: "missing_org_id", eventType });
      }

      if (eventType === "organization.created" || eventType === "organization.updated") {
        const orgFields = resolveOrgFields(data);
        await app.cloudStore.upsertOrganization({
          orgId,
          ...orgFields,
        });

        await recordAuditEvent(app, {
          organizationId: orgId,
          actorType: "webhook",
          actorId: "clerk",
          action: "webhook.organization.upserted",
          targetType: "organization",
          targetId: orgId,
          payload: rawPayload,
          metadata: {
            eventType,
            ...orgFields,
          },
        });
      }

      const plan = resolvePlanFromEvent(data);
      if (plan) {
        const delinquent = isDelinquentStatus(data);
        const graceEndsAt = delinquent ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
        await app.cloudStore.upsertEntitlementForOrg(orgId, {
          tier: plan,
          delinquent,
          graceEndsAt,
        });

        await recordAuditEvent(app, {
          organizationId: orgId,
          actorType: "webhook",
          actorId: "clerk",
          action: "webhook.entitlement.updated",
          targetType: "billing_entitlement",
          targetId: orgId,
          payload: rawPayload,
          metadata: {
            eventType,
            tier: plan,
            delinquent,
            graceEndsAt,
          },
        });
      }

      return ok(reply, { received: true, eventType });
    } catch (error) {
      return handleError(reply, error);
    }
    }
  );
}
