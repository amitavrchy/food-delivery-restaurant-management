import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Db } from './db';
import { Cache } from './redis';
import { Public } from './auth';
@Controller('health')
export class HealthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Cache) private cache: Cache,
  ) {}
  @Public() @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      await this.cache.redis.ping();
      return { status: 'ok', database: 'up', queue: 'up' };
    } catch {
      throw new ServiceUnavailableException('Dependencies are unavailable.');
    }
  }
}
