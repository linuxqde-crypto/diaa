import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

/**
 * settings table accessor (dot-namespaced keys seeded in PHASE 1).
 * Values cached in Redis for 30s; falls back to DB when Redis is absent.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async number(key: string, dflt: number): Promise<number> {
    const v = await this.get<number>(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  }

  async string(key: string, dflt?: string): Promise<string | undefined> {
    return (await this.get<string>(key)) ?? dflt;
  }

  private async get<T>(key: string): Promise<T | undefined> {
    const ck = `settings:${key}`;
    const cached = await this.redis.getJson<T>(ck);
    if (cached !== undefined) return cached;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return undefined;
    const value = row.value as unknown as T;
    await this.redis.setJson(ck, value, 30);
    return value;
  }
}
