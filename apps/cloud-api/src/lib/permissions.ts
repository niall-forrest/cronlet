import { ERROR_CODES, type CloudAuthContext } from "@cronlet/shared";
import { AppError } from "./errors.js";

export type Role = CloudAuthContext["role"];

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

function hasScope(scopes: string[] | undefined, requiredScope: string): boolean {
  if (!scopes || scopes.length === 0) {
    return false;
  }

  return scopes.includes("*") || scopes.includes(requiredScope);
}

export function requireRole(auth: CloudAuthContext, minimumRole: Role): void {
  if (ROLE_RANK[auth.role] < ROLE_RANK[minimumRole]) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, `Requires ${minimumRole} role`);
  }
}

export function requireScope(auth: CloudAuthContext, requiredScope: string): void {
  if (auth.actorType !== "api_key") {
    return;
  }

  if (!hasScope(auth.scopes, requiredScope)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, `API key scope missing: ${requiredScope}`);
  }
}

export function authorize(
  auth: CloudAuthContext,
  options: {
    minimumRole: Role;
    requiredScope: string;
  }
): void {
  requireRole(auth, options.minimumRole);
  requireScope(auth, options.requiredScope);
}
