import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class OutboundTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundTargetError";
  }
}

export interface OutboundPolicy {
  allowedHosts: ReadonlySet<string> | null;
  resolveHostname(hostname: string): Promise<readonly string[]>;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  const [a, b, c, d] = octets;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }

  return [a, b, c, d];
}

function isPrivateIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }

  if (a >= 224) {
    return true;
  }

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  const mappedIpv4Match = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4Match?.[1]) {
    return isPrivateIpv4(mappedIpv4Match[1]);
  }

  const firstSegmentText = normalized.split(":")[0] ?? "";
  const firstSegment = firstSegmentText === "" ? 0 : Number.parseInt(firstSegmentText, 16);
  if (Number.isNaN(firstSegment)) {
    return false;
  }

  if ((firstSegment & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((firstSegment & 0xffc0) === 0xfe80) {
    return true;
  }

  if ((firstSegment & 0xff00) === 0xff00) {
    return true;
  }

  return false;
}

function isBlockedAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }

  return false;
}

function parseAllowedHosts(raw = process.env.CLOUD_ALLOWED_OUTBOUND_HOSTS): ReadonlySet<string> | null {
  if (!raw) {
    return null;
  }

  const hosts = raw
    .split(",")
    .map((value) => normalizeHostname(value))
    .filter((value) => value.length > 0);

  return hosts.length > 0 ? new Set(hosts) : null;
}

function toAllowedHostSet(hosts: readonly string[] | null | undefined): ReadonlySet<string> | null {
  if (!hosts || hosts.length === 0) {
    return null;
  }

  return new Set(hosts.map((value) => normalizeHostname(value)).filter((value) => value.length > 0));
}

async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map((entry) => entry.address);
}

export function createOutboundPolicyFromEnv(): OutboundPolicy {
  return {
    allowedHosts: parseAllowedHosts(),
    resolveHostname: resolvePublicAddresses,
  };
}

export function createScopedOutboundPolicy(
  basePolicy: OutboundPolicy,
  allowedHosts: readonly string[] | null | undefined,
): OutboundPolicy {
  const scopedAllowedHosts = toAllowedHostSet(allowedHosts);
  if (!scopedAllowedHosts) {
    return basePolicy;
  }

  const mergedAllowedHosts = basePolicy.allowedHosts
    ? new Set(Array.from(scopedAllowedHosts).filter((hostname) => basePolicy.allowedHosts?.has(hostname)))
    : scopedAllowedHosts;

  return {
    allowedHosts: mergedAllowedHosts,
    resolveHostname: basePolicy.resolveHostname,
  };
}

export async function assertSafeOutboundUrl(url: string, policy: OutboundPolicy): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OutboundTargetError(`Outbound target is not a valid URL: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new OutboundTargetError(`Outbound target must use http or https: ${url}`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new OutboundTargetError(`Outbound target ${url} resolves to a blocked local hostname`);
  }

  if (policy.allowedHosts && !policy.allowedHosts.has(hostname)) {
    throw new OutboundTargetError(`Outbound target ${url} is not in the configured allowlist`);
  }

  const addresses = isIP(hostname) ? [hostname] : await policy.resolveHostname(hostname);
  if (addresses.length === 0) {
    throw new OutboundTargetError(`Outbound target ${url} did not resolve to any addresses`);
  }

  const blockedAddress = addresses.find((address) => isBlockedAddress(address));
  if (blockedAddress) {
    throw new OutboundTargetError(`Outbound target ${url} resolved to blocked address ${blockedAddress}`);
  }
}
