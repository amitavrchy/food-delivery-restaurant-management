import { ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: 'Serializable',
          maxWait: 15000,
          timeout: 15000,
        });
      } catch (e) {
        if (
          (e instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2034', 'P2028'].includes(e.code)) ||
          (e instanceof Prisma.PrismaClientUnknownRequestError &&
            /40P01|40001|deadlock detected|could not serialize/i.test(e.message))
        ) {
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 40 * 2 ** attempt));
            continue;
          }
          throw new ConflictException('This resource is busy. Refresh and try again.');
        }
        throw e;
      }
    }
  }
}
