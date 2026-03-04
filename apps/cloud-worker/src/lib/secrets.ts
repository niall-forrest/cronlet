import type { CloudApiClient } from "./api.js";

interface CachedSecret {
  value: string;
  expiresAt: number;
}

/**
 * Secrets cache with TTL-based expiration
 */
export class SecretsCache {
  private cache: Map<string, CachedSecret> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: CloudApiClient,
    private readonly ttlMs: number = 5 * 60 * 1000 // 5 minutes default
  ) {}

  /**
   * Start periodic cleanup of expired entries
   */
  start(intervalMs: number = 60_000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get a secret value, using cache if available
   */
  async get(orgId: string, name: string): Promise<string> {
    const key = `${orgId}:${name}`;
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Fetch from API
    const result = await this.api.getSecretValue(orgId, name);

    this.cache.set(key, {
      value: result.value,
      expiresAt: Date.now() + this.ttlMs,
    });

    return result.value;
  }

  /**
   * Invalidate a specific secret
   */
  invalidate(orgId: string, name: string): void {
    const key = `${orgId}:${name}`;
    this.cache.delete(key);
  }

  /**
   * Clear all cached secrets for an org
   */
  invalidateOrg(orgId: string): void {
    const prefix = `${orgId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached secrets
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Create a getter function bound to a specific org
   * (useful for passing to tool context)
   */
  createGetter(orgId: string): (name: string) => Promise<string> {
    return (name: string) => this.get(orgId, name);
  }
}
