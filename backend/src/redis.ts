import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
@Injectable()
export class Cache implements OnModuleDestroy {
  readonly redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6381',{maxRetriesPerRequest:null});
  async onModuleDestroy() { await this.redis.quit(); }
  async menu<T>(id:string, load:()=>Promise<T>):Promise<T> {
    const value = await this.redis.get(`menu:${id}`); if(value) return JSON.parse(value);
    const data = await load(); await this.redis.set(`menu:${id}`,JSON.stringify(data),'EX',60); return data;
  }
  async invalidate(id:string) { await this.redis.del(`menu:${id}`); }
}
