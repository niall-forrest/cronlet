import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import type { PlanTier } from "@cronlet/cloud-shared";
import { ERROR_CODES } from "@cronlet/cloud-shared";
import { AppError } from "../lib/errors.js";
import { handleError, ok } from "../lib/http.js";
import { recordAuditEvent } from "../lib/audit.js";
import { personalOrgIdForUser } from "../lib/tenancy.js";

interface ClerkWebhookEvent {
  type?: string;
  data?: Record<string, unknown>;
}

function parseAliases(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function getPlanAliases(): Record<PlanTier, string[]> {
  return {
    free: parseAliases(process.env.CLERK_BILLING_FREE_PLAN_KEYS, ["free", "free_user"]),
    pro: parseAliases(process.env.CLERK_BILLING_PRO_PLAN_KEYS, ["pro", "cronlet_pro"]),
    team: parseAliases(process.env.CLERK_BILLING_TEAM_PLAN_KEYS, ["team", "cronlet_team"]),
  };
}

function parsePlanTier(value: unknown, aliases: Record<PlanTier, string[]>): PlanTier | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const tier of ["free", "pro", "team"] as const) {
    if (aliases[tier].includes(normalized)) {
      return tier;
    }
  }

  return null;
}

function resolvePlanFromEvent(data: Record<string, unknown>, aliases: Record<PlanTier, string[]>): PlanTier | null {
  const nestedPlan = typeof data.plan === "object" && data.plan ? (data.plan as Record<string, unknown>) : null;
  const candidates = [
    data.plan,
    data.plan_key,
    data.planKey,
    data.plan_slug,
    data.planSlug,
    data.tier,
    nestedPlan?.key,
    nestedPlan?.slug,
    nestedPlan?.name,
    typeof data.public_metadata === "object" && data.public_metadata ? (data.public_metadata as Record<string, unknown>).plan : null,
  ];

  for (const candidate of candidates) {
    const parsed = parsePlanTier(candidate, aliases);
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

  const userIdCandidates = [
    data.user_id,
    data.userId,
    typeof data.user === "object" && data.user ? (data.user as Record<string, unknown>).id : null,
    typeof data.customer === "object" && data.customer ? (data.customer as Record<string, unknown>).id : null,
  ];

  for (const candidate of userIdCandidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return personalOrgIdForUser(candidate);
    }
  }

  return null;
}

function resolveOrgFields(data: Record<string, unknown>): { name?: string; slug?: string } {
  const name = typeof data.name === "string" ? data.name : undefined;
  const slug = typeof data.slug === "string" ? data.slug : undefined;
  return { name, slug };
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  const planAliases = getPlanAliases();

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

      const plan = resolvePlanFromEvent(data, planAliases);
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
