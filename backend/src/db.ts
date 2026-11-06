import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
  async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 }); }
      catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034' && attempt < 4) continue; throw e; }
    }
  }
}
