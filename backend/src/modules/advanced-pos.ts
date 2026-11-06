import { Body, ConflictException, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { id, managers, parse, required, scope } from '../common';
import { allocateMinor, price } from '../domain/pricing';
@Controller('pos/checks')
export class AdvancedPosController {
  constructor(@Inject(Db) private db: Db) {}
  @Post(':id/discount') async discount(
    @Req() req: Authed,
    @Param('id') checkId: string,
    @Body() body: unknown,
  ) {
    const initial = required(
      await this.db.tableCheck.findUnique({
        where: { id: checkId },
        include: { table: { include: { restaurant: true } } },
      }),
    );
    await scope(this.db, req.user, initial.table.restaurantId, managers);
    const data = parse(
      z.object({
        type: z.enum(['PERCENT', 'FIXED']),
        value: z.number().int().min(0).max(100000000),
        reason: z.string().trim().min(5).max(300),
        managerPin: z.string().max(20),
      }),
      body,
    );
    if (data.managerPin !== process.env.MANAGER_PIN)
      throw new ConflictException('Manager PIN is incorrect.');
    if (data.type === 'PERCENT' && data.value > 100)
      throw new ConflictException('Percentage cannot exceed 100.');
    return this.db.atomic(async (tx) => {
      const check = required(
        await tx.tableCheck.findUnique({
          where: { id: checkId },
          include: { orders: { where: { status: { not: 'CANCELLED' } } }, payments: true },
        }),
      );
      if (check.status !== 'OPEN' || check.payments.length || !check.orders.length)
        throw new ConflictException('Discounts require an unpaid open check with orders.');
      const goods = check.orders.reduce((s, o) => s + o.goodsMinor, 0),
        discount = data.type === 'PERCENT' ? Math.round((goods * data.value) / 100) : data.value;
      if (discount > goods) throw new ConflictException('Discount exceeds the food subtotal.');
      const allocations = allocateMinor(
        discount,
        check.orders.map((o) => o.goodsMinor),
      );
      for (const [i, order] of check.orders.entries()) {
        const amounts = price(
          order.goodsMinor,
          order.channel,
          order.deliveryFeeMinor,
          allocations[i],
          order.tipMinor,
          initial.table.restaurant.taxBps,
          initial.table.restaurant.serviceBps,
        );
        await tx.order.update({ where: { id: order.id }, data: amounts });
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: { amountMinor: amounts.grandMinor },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'CHECK_DISCOUNT',
          entityId: checkId,
          detail: {
            type: data.type,
            value: data.value,
            discountMinor: discount,
            reason: data.reason,
          },
        },
      });
      return { discountMinor: discount };
    });
  }
  @Post(':id/move') async move(
    @Req() req: Authed,
    @Param('id') checkId: string,
    @Body() body: unknown,
  ) {
    const check = required(
      await this.db.tableCheck.findUnique({ where: { id: checkId }, include: { table: true } }),
    );
    await scope(this.db, req.user, check.table.restaurantId, [
      'WAITER',
      'CASHIER',
      'MANAGER',
      'RESTAURANT_OWNER',
    ]);
    const { targetTableId } = parse(z.object({ targetTableId: id }), body);
    const target = required(
      await this.db.diningTable.findFirst({
        where: { id: targetTableId, restaurantId: check.table.restaurantId },
      }),
    );
    return this.db.atomic(async (tx) => {
      const current = required(
        await tx.tableCheck.findUnique({
          where: { id: checkId },
          include: { orders: { include: { lines: true } } },
        }),
      );
      if (
        current.status !== 'OPEN' ||
        (await tx.tableCheck.count({ where: { tableId: target.id, status: 'OPEN' } }))
      )
        throw new ConflictException('Destination table must be available.');
      const seat = Math.max(1, ...current.orders.flatMap((o) => o.lines.map((l) => l.seat)));
      if (seat > target.seats)
        throw new ConflictException(
          'Destination capacity is smaller than the check’s seat assignments.',
        );
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'TABLE_MOVED',
          entityId: checkId,
          detail: { from: current.tableId, to: target.id },
        },
      });
      return tx.tableCheck.update({ where: { id: checkId }, data: { tableId: target.id } });
    });
  }
  @Post(':id/merge') async merge(
    @Req() req: Authed,
    @Param('id') sourceId: string,
    @Body() body: unknown,
  ) {
    const source = required(
      await this.db.tableCheck.findUnique({ where: { id: sourceId }, include: { table: true } }),
    );
    await scope(this.db, req.user, source.table.restaurantId, managers);
    const { targetCheckId } = parse(z.object({ targetCheckId: id }), body);
    if (targetCheckId === sourceId) throw new ConflictException('Choose another check.');
    return this.db.atomic(async (tx) => {
      const sourceCheck = required(
          await tx.tableCheck.findUnique({ where: { id: sourceId }, include: { payments: true } }),
        ),
        target = required(
          await tx.tableCheck.findFirst({
            where: { id: targetCheckId, table: { restaurantId: source.table.restaurantId } },
            include: { payments: true },
          }),
        );
      if (
        sourceCheck.status !== 'OPEN' ||
        target.status !== 'OPEN' ||
        sourceCheck.payments.length ||
        target.payments.length
      )
        throw new ConflictException('Only two unpaid open checks can be merged.');
      await tx.order.updateMany({
        where: { tableCheckId: sourceId },
        data: { tableCheckId: targetCheckId },
      });
      await tx.tableCheck.update({
        where: { id: sourceId },
        data: { status: 'MERGED', closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'CHECKS_MERGED',
          entityId: targetCheckId,
          detail: { sourceId },
        },
      });
      return { targetCheckId };
    });
  }
}
