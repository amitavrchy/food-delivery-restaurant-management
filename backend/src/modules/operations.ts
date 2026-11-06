import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Cache } from '../redis';
import { Authed } from '../auth';
import { id, managers, money, parse, required, scope } from '../common';
import { transitionTx } from './transitions';
@Controller()
export class OperationsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Cache) private cache: Cache,
  ) {}
  @Put('menu/:id/modifiers') async modifiers(
    @Param('id') itemId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const item = required(await this.db.menuItem.findUnique({ where: { id: itemId } }));
    await scope(this.db, req.user, item.restaurantId, managers);
    const option = z.object({
      name: z.string().trim().min(1).max(80),
      priceDeltaMinor: money,
      inventoryItemId: id.nullable().optional(),
      ingredientQty: z.number().min(0).max(10000).default(0),
    });
    const group = z
      .object({
        name: z.string().trim().min(1).max(80),
        minSelect: z.number().int().min(0).max(10),
        maxSelect: z.number().int().min(1).max(10),
        options: z.array(option).min(1).max(20),
      })
      .refine(
        (g) => g.minSelect <= g.maxSelect && g.maxSelect <= g.options.length,
        'Selection limits must fit the available options.',
      );
    const { groups } = parse(z.object({ groups: z.array(group).max(10) }), body);
    for (const g of groups)
      for (const o of g.options)
        if (o.inventoryItemId)
          required(
            await this.db.inventoryItem.findFirst({
              where: { id: o.inventoryItemId, restaurantId: item.restaurantId },
            }),
          );
    const result = await this.db.atomic(async (tx) => {
      await tx.modifierOption.deleteMany({ where: { group: { menuItemId: itemId } } });
      await tx.modifierGroup.deleteMany({ where: { menuItemId: itemId } });
      for (const g of groups)
        await tx.modifierGroup.create({
          data: {
            menuItemId: itemId,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: { create: g.options },
          },
        });
      return { ok: true };
    });
    await this.cache.invalidate(item.restaurantId);
    return result;
  }
  @Post('inventory/restaurant/:id') async ingredient(
    @Param('id') restaurantId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        uom: z.enum(['kg', 'g', 'L', 'ml', 'pcs']),
        qtyOnHand: z.number().min(0).max(100000),
        lowStockQty: z.number().min(0).max(100000),
        costMinor: money,
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const item = await tx.inventoryItem.create({ data: { restaurantId, ...data } });
      if (data.qtyOnHand > 0)
        await tx.stockMovement.create({
          data: {
            inventoryItemId: item.id,
            delta: data.qtyOnHand,
            reason: 'OPENING',
            byUserId: req.user.id,
          },
        });
      return item;
    });
  }
  @Patch('inventory/:id') async ingredientSettings(
    @Param('id') inventoryItemId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const item = required(
      await this.db.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
    );
    await scope(this.db, req.user, item.restaurantId, managers);
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(100).optional(),
        lowStockQty: z.number().min(0).max(100000).optional(),
        costMinor: money.optional(),
      }),
      body,
    );
    return this.db.inventoryItem.update({ where: { id: inventoryItemId }, data });
  }
  @Post('pos/checks/:id/complimentary') async comp(
    @Param('id') checkId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const initial = required(
      await this.db.tableCheck.findUnique({ where: { id: checkId }, include: { table: true } }),
    );
    await scope(this.db, req.user, initial.table.restaurantId, managers);
    const data = parse(
      z.object({
        managerPin: z.string().min(1).max(20),
        reason: z.string().trim().min(5).max(300),
      }),
      body,
    );
    if (data.managerPin !== process.env.MANAGER_PIN)
      throw new ForbiddenException('Manager PIN is incorrect.');
    return this.db.atomic(async (tx) => {
      const check = required(
        await tx.tableCheck.findUnique({
          where: { id: checkId },
          include: { orders: { where: { status: { not: 'CANCELLED' } } }, payments: true },
        }),
      );
      if (
        check.status !== 'OPEN' ||
        check.payments.length ||
        !check.orders.length ||
        check.orders.some((o) => o.status !== 'SERVED')
      )
        throw new ConflictException(
          'Only an unpaid check with fully served orders can be made complimentary.',
        );
      for (const order of check.orders) {
        await transitionTx(tx, order, 'CLOSED', req.user.id, data.reason);
        await tx.order.update({
          where: { id: order.id },
          data: { discountMinor: order.goodsMinor, taxMinor: 0, serviceMinor: 0, grandMinor: 0 },
        });
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: { amountMinor: 0, status: 'CAPTURED' },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'COMPLIMENTARY_CHECK',
          entityId: checkId,
          detail: {
            reason: data.reason,
            originalMinor: check.orders.reduce((s, o) => s + o.grandMinor, 0),
          },
        },
      });
      return tx.tableCheck.update({
        where: { id: checkId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    });
  }
  @Post('pos/checks/:id/close-empty') async closeEmpty(
    @Param('id') checkId: string,
    @Req() req: Authed,
  ) {
    const initial = required(
      await this.db.tableCheck.findUnique({ where: { id: checkId }, include: { table: true } }),
    );
    await scope(this.db, req.user, initial.table.restaurantId, [
      'WAITER',
      'CASHIER',
      'MANAGER',
      'RESTAURANT_OWNER',
    ]);
    return this.db.atomic(async (tx) => {
      const check = required(
        await tx.tableCheck.findUnique({
          where: { id: checkId },
          include: { orders: true, payments: true },
        }),
      );
      if (
        check.status !== 'OPEN' ||
        check.orders.some((o) => o.status !== 'CANCELLED') ||
        check.payments.length
      )
        throw new ConflictException('This check has unsettled orders.');
      return tx.tableCheck.update({
        where: { id: checkId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    });
  }
  @Post('orders/:id/delivery-code') async deliveryCode(
    @Param('id') orderId: string,
    @Req() req: Authed,
  ) {
    const order = required(
      await this.db.order.findFirst({
        where: {
          id: orderId,
          customerId: req.user.id,
          channel: 'DELIVERY',
          status: {
            in: [
              'PLACED',
              'ACCEPTED',
              'IN_KITCHEN',
              'READY',
              'ASSIGNING_RIDER',
              'PICKED_UP',
              'ARRIVING',
            ],
          },
        },
      }),
    );
    const allowed = await this.cache.redis.set(`otp:rotate:${orderId}`, '1', 'EX', 30, 'NX');
    if (!allowed) throw new ConflictException('Wait 30 seconds before requesting another code.');
    const { randomInt } = await import('crypto');
    const { hash } = await import('bcryptjs');
    const otp = String(randomInt(100000, 1000000));
    await this.db.order.update({ where: { id: order.id }, data: { otpHash: await hash(otp, 10) } });
    return { deliveryOtp: otp };
  }
}
