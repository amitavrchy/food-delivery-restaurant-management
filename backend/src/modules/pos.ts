import { Body, ConflictException, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { id, key, money, parse, required, scope } from '../common';
import { allocateMinor, splitBill } from '../domain/pricing';
import { transitionTx } from './transitions';
import { orderInclude } from './orders';
@Controller('pos')
export class PosController {
  constructor(@Inject(Db) private db: Db) {}
  @Get(':restaurantId/tables') async tables(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Authed,
  ) {
    await scope(this.db, req.user, restaurantId);
    const tables = await this.db.diningTable.findMany({
      where: { restaurantId },
      include: {
        checks: {
          where: { status: 'OPEN' },
          include: { orders: { include: orderInclude }, payments: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    return tables.map((table) => ({
      ...table,
      checks: table.checks.map((check) => ({
        ...check,
        orders: check.orders.map(({ otpHash, ...order }) => order),
      })),
    }));
  }
  @Post('tables/:id/open') async open(@Param('id') tableId: string, @Req() req: Authed) {
    const table = required(await this.db.diningTable.findUnique({ where: { id: tableId } }));
    await scope(this.db, req.user, table.restaurantId, [
      'WAITER',
      'CASHIER',
      'MANAGER',
      'RESTAURANT_OWNER',
    ]);
    return this.db.atomic(async (tx) => {
      const existing = await tx.tableCheck.findFirst({ where: { tableId, status: 'OPEN' } });
      return existing || tx.tableCheck.create({ data: { tableId } });
    });
  }
  @Get('checks/:id/split') async split(@Param('id') checkId: string, @Req() req: Authed) {
    const check = required(
      await this.db.tableCheck.findUnique({
        where: { id: checkId },
        include: {
          table: true,
          orders: { where: { status: { not: 'CANCELLED' } }, include: { lines: true } },
          payments: true,
        },
      }),
    );
    await scope(this.db, req.user, check.table.restaurantId);
    const total = check.orders.reduce((s, o) => s + o.grandMinor, 0);
    const paid = check.payments.reduce((s, p) => s + p.amountMinor, 0);
    const seatGoods = new Map<number, number>();
    for (const o of check.orders)
      for (const l of o.lines)
        seatGoods.set(l.seat, (seatGoods.get(l.seat) || 0) + l.qty * l.unitPriceMinor);
    const seats = [...seatGoods.entries()].sort((a, b) => a[0] - b[0]);
    const goods = seats.reduce((s, [, v]) => s + v, 0);
    let allocated = 0;
    const bySeat = seats.map(([seat, value], i) => {
      const amount =
        i === seats.length - 1 ? total - allocated : Math.floor((total * value) / (goods || 1));
      allocated += amount;
      return {
        seat,
        amountMinor: amount,
        paidMinor: check.payments
          .filter((p) => p.seat === seat)
          .reduce((s, p) => s + p.amountMinor, 0),
      };
    });
    const lines = check.orders.flatMap((o) => o.lines).sort((a, b) => a.id.localeCompare(b.id));
    const allocations = allocateMinor(
      total,
      lines.map((l) => l.qty * l.unitPriceMinor),
    );
    const byItem = lines.map((line, i) => ({
      lineId: line.id,
      name: line.nameSnapshot,
      qty: line.qty,
      amountMinor: allocations[i],
      paidMinor: check.payments
        .filter((p) => p.lineId === line.id)
        .reduce((s, p) => s + p.amountMinor, 0),
    }));
    return {
      totalMinor: total,
      paidMinor: paid,
      dueMinor: total - paid,
      equal: splitBill(total, check.table.seats),
      bySeat,
      byItem,
      hasUnallocatedPayments: check.payments.some((p) => !p.lineId),
    };
  }
  @Post('checks/:id/pay') async pay(
    @Param('id') checkId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const initial = required(
      await this.db.tableCheck.findUnique({ where: { id: checkId }, include: { table: true } }),
    );
    await scope(this.db, req.user, initial.table.restaurantId, [
      'CASHIER',
      'MANAGER',
      'RESTAURANT_OWNER',
    ]);
    const data = parse(
      z.object({
        amountMinor: money.refine((v) => v > 0),
        method: z.enum(['CASH', 'CARD']),
        seat: z.number().int().min(1).max(30).optional(),
        lineId: id.optional(),
        idempotencyKey: key,
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const existing = await tx.checkPayment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        if (existing.checkId !== checkId) throw new ConflictException();
        return existing;
      }
      const check = required(
        await tx.tableCheck.findUnique({
          where: { id: checkId },
          include: {
            orders: { where: { status: { not: 'CANCELLED' } }, include: { lines: true } },
            payments: true,
          },
        }),
      );
      if (check.status !== 'OPEN') throw new ConflictException('Check is closed.');
      const due =
        check.orders.reduce((s, o) => s + o.grandMinor, 0) -
        check.payments.reduce((s, p) => s + p.amountMinor, 0);
      if (data.amountMinor > due)
        throw new ConflictException('Payment exceeds the remaining balance.');
      if (data.lineId) {
        if (check.payments.some((p) => !p.lineId))
          throw new ConflictException(
            'After a general or seat payment, settle using the remaining balance.',
          );
        const lines = check.orders.flatMap((o) => o.lines).sort((a, b) => a.id.localeCompare(b.id));
        const index = lines.findIndex((l) => l.id === data.lineId);
        if (index < 0) throw new ConflictException('This item does not belong to this check.');
        const allocations = allocateMinor(
          check.orders.reduce((s, o) => s + o.grandMinor, 0),
          lines.map((l) => l.qty * l.unitPriceMinor),
        );
        const paidForLine = check.payments
          .filter((p) => p.lineId === data.lineId)
          .reduce((s, p) => s + p.amountMinor, 0);
        if (data.amountMinor > allocations[index] - paidForLine)
          throw new ConflictException('Payment exceeds this item’s remaining share.');
      }
      if (check.orders.some((o) => !['SERVED', 'CLOSED'].includes(o.status)))
        throw new ConflictException('Serve all orders before settling the bill.');
      const payment = await tx.checkPayment.create({ data: { checkId, ...data } });
      if (data.amountMinor === due) {
        await tx.tableCheck.update({
          where: { id: checkId },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        for (const order of check.orders)
          if (order.status === 'SERVED') await transitionTx(tx, order, 'CLOSED', req.user.id);
        await tx.payment.updateMany({
          where: { orderId: { in: check.orders.map((o) => o.id) }, status: 'PENDING' },
          data: { status: 'CAPTURED' },
        });
      }
      return payment;
    });
  }
}
