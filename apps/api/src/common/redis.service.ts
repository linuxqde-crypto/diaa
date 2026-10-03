import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Shared Redis client (lazy). Used for: catalog caching, rate-lock TTL mirror (PHASE 3),
 * BullMQ connections (PHASE 3+), session/refresh bookkeeping (PHASE 5).
 * Degrades gracefully when REDIS_URL is unset (dev without redis) — callers must tolerate null.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private _client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  get client(): Redis | null {
    if (this._client) return this._client;
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return null;
    this._client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
    this._client.on('error', (e) => console.warn('[redis] error:', (e as Error).message));
    return this._client;
  }

  /** JSON cache helper with TTL seconds; no-op fallback returns undefined on miss. */
  async getJson<T>(key: string): Promise<T | undefined> {
    const c = this.client;
    if (!c) return undefined;
    try {
      const v = await c.get(key);
      return v ? (JSON.parse(v) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const c = this.client;
    if (!c) return;
    try {
      await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache is best-effort */
    }
  }

  async del(prefixGlob: string): Promise<void> {
    const c = this.client;
    if (!c) return;
    try {
      const keys = await c.keys(prefixGlob);
      if (keys.length) await c.del(...keys);
    } catch {
      /* best-effort */
    }
  }

  async onModuleDestroy() {
    if (this._client) await this._client.quit().catch(() => undefined);
  }
}
