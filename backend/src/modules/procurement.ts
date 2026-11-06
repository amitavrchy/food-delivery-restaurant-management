import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { id, key, managers, money, parse, required, scope } from '../common';
const quantity = z
  .number()
  .positive()
  .max(100000)
  .refine(
    (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.000001,
    'Use at most three decimal places.',
  );
@Controller('procurement')
export class ProcurementController {
  constructor(@Inject(Db) private db: Db) {}
  @Get(':restaurantId') async overview(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    return {
      suppliers: await this.db.supplier.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      orders: await this.db.purchaseOrder.findMany({
        where: { restaurantId },
        include: { supplier: true, lines: { include: { ingredient: true } }, receipts: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      transfers: await this.db.stockTransfer.findMany({
        where: { OR: [{ source: { restaurantId } }, { target: { restaurantId } }] },
        include: {
          source: { select: { name: true, restaurantId: true, uom: true } },
          target: { select: { name: true, restaurantId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    };
  }
  @Post(':restaurantId/suppliers') async supplier(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        email: z.email().optional(),
        phone: z.string().min(7).max(25),
        leadDays: z.number().int().min(0).max(90).default(1),
      }),
      body,
    );
    return this.db.supplier.create({ data: { restaurantId, ...data } });
  }
  @Post(':restaurantId/orders') async order(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        supplierId: id,
        expectedAt: z.iso.datetime({ offset: true }).optional(),
        notes: z.string().max(500).default(''),
        lines: z
          .array(z.object({ inventoryItemId: id, orderedQty: quantity, unitCostMinor: money }))
          .min(1)
          .max(100),
      }),
      body,
    );
    required(
      await this.db.supplier.findFirst({
        where: { id: data.supplierId, restaurantId, active: true },
      }),
    );
    if (new Set(data.lines.map((l) => l.inventoryItemId)).size !== data.lines.length)
      throw new ConflictException('Use one purchase line per ingredient.');
    for (const line of data.lines)
      required(
        await this.db.inventoryItem.findFirst({
          where: { id: line.inventoryItemId, restaurantId },
        }),
      );
    return this.db.purchaseOrder.create({
      data: {
        restaurantId,
        supplierId: data.supplierId,
        expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
        notes: data.notes,
        createdById: req.user.id,
        lines: { create: data.lines },
      },
    });
  }
  @Patch('orders/:id') async submit(
    @Req() req: Authed,
    @Param('id') orderId: string,
    @Body() body: unknown,
  ) {
    const order = required(await this.db.purchaseOrder.findUnique({ where: { id: orderId } }));
    await scope(this.db, req.user, order.restaurantId, managers);
    const { status } = parse(z.object({ status: z.enum(['ORDERED', 'CANCELLED']) }), body);
    return this.db.atomic(async (tx) => {
      const current = required(await tx.purchaseOrder.findUnique({ where: { id: orderId } }));
      if (
        (status === 'ORDERED' && current.status !== 'DRAFT') ||
        (status === 'CANCELLED' && !['DRAFT', 'ORDERED', 'PARTIAL'].includes(current.status))
      )
        throw new ConflictException('This purchase order cannot move to that state.');
      return tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });
    });
  }
  @Post('orders/:id/receive') async receive(
    @Req() req: Authed,
    @Param('id') orderId: string,
    @Body() body: unknown,
  ) {
    const order = required(await this.db.purchaseOrder.findUnique({ where: { id: orderId } }));
    await scope(this.db, req.user, order.restaurantId, managers);
    const data = parse(
      z.object({
        idempotencyKey: key,
        invoiceReference: z.string().trim().min(2).max(100),
        lines: z
          .array(z.object({ lineId: id, qty: quantity }))
          .min(1)
          .max(100),
      }),
      body,
    );
    if (new Set(data.lines.map((l) => l.lineId)).size !== data.lines.length)
      throw new ConflictException('Duplicate receipt lines.');
    return this.db.atomic(async (tx) => {
      const existing = await tx.stockReceipt.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        if (existing.purchaseOrderId !== orderId)
          throw new ConflictException('Receipt key was used for another order.');
        return existing;
      }
      const current = required(
        await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } }),
      );
      if (!['ORDERED', 'PARTIAL'].includes(current.status))
        throw new ConflictException('Submit this purchase order before receiving stock.');
      const receipt = await tx.stockReceipt.create({
        data: {
          purchaseOrderId: orderId,
          idempotencyKey: data.idempotencyKey,
          invoiceReference: data.invoiceReference,
          lines: data.lines,
          byUserId: req.user.id,
        },
      });
      for (const entry of data.lines) {
        const line = required(current.lines.find((l) => l.id === entry.lineId));
        const qty = new Prisma.Decimal(entry.qty);
        if (line.receivedQty.add(qty).greaterThan(line.orderedQty))
          throw new ConflictException(
            'Received quantity exceeds the outstanding purchase quantity.',
          );
        const ingredient = required(
          await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } }),
        );
        const total = ingredient.qtyOnHand.add(qty);
        const weightedCost = ingredient.qtyOnHand
          .mul(ingredient.costMinor)
          .add(qty.mul(line.unitCostMinor))
          .div(total)
          .toDecimalPlaces(0)
          .toNumber();
        await tx.inventoryItem.update({
          where: { id: ingredient.id },
          data: { qtyOnHand: { increment: qty }, costMinor: weightedCost },
        });
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: { increment: qty } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryItemId: ingredient.id,
            delta: qty,
            reason: 'PURCHASE_RECEIPT',
            reference: receipt.id,
            byUserId: req.user.id,
          },
        });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: orderId },
      });
      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: {
          status: refreshed.every((l) => l.receivedQty.equals(l.orderedQty))
            ? 'RECEIVED'
            : 'PARTIAL',
        },
      });
      return receipt;
    });
  }
  @Post('transfers') async transfer(@Req() req: Authed, @Body() body: unknown) {
    const data = parse(
      z.object({
        sourceItemId: id,
        targetItemId: id,
        qty: quantity,
        reason: z.string().trim().min(3).max(300),
        idempotencyKey: key,
      }),
      body,
    );
    if (data.sourceItemId === data.targetItemId)
      throw new ConflictException('Choose a different destination ingredient.');
    const source = required(
        await this.db.inventoryItem.findUnique({
          where: { id: data.sourceItemId },
          include: { restaurant: true },
        }),
      ),
      target = required(
        await this.db.inventoryItem.findUnique({
          where: { id: data.targetItemId },
          include: { restaurant: true },
        }),
      );
    await scope(this.db, req.user, source.restaurantId, managers);
    await scope(this.db, req.user, target.restaurantId, managers);
    if (
      source.restaurantId === target.restaurantId ||
      !source.restaurant.organizationId ||
      source.restaurant.organizationId !== target.restaurant.organizationId ||
      source.uom !== target.uom
    )
      throw new ConflictException(
        'Transfers require different branches in the same organization and matching units.',
      );
    return this.db.atomic(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        if (
          existing.sourceItemId !== source.id ||
          existing.targetItemId !== target.id ||
          !existing.qty.equals(data.qty) ||
          existing.reason !== data.reason
        )
          throw new ConflictException();
        return existing;
      }
      const current = required(await tx.inventoryItem.findUnique({ where: { id: source.id } }));
      if (current.qtyOnHand.lessThan(data.qty))
        throw new ConflictException('Insufficient source stock.');
      const result = await tx.stockTransfer.create({ data: { ...data, byUserId: req.user.id } });
      const destination = required(await tx.inventoryItem.findUnique({ where: { id: target.id } }));
      const qty = new Prisma.Decimal(data.qty),
        total = destination.qtyOnHand.add(qty);
      await tx.inventoryItem.update({
        where: { id: source.id },
        data: { qtyOnHand: { decrement: qty } },
      });
      await tx.inventoryItem.update({
        where: { id: target.id },
        data: {
          qtyOnHand: { increment: qty },
          costMinor: destination.qtyOnHand
            .mul(destination.costMinor)
            .add(qty.mul(current.costMinor))
            .div(total)
            .toDecimalPlaces(0)
            .toNumber(),
        },
      });
      for (const [inventoryItemId, delta] of [
        [source.id, qty.negated()],
        [target.id, qty],
      ] as const)
        await tx.stockMovement.create({
          data: {
            inventoryItemId,
            delta,
            reason: 'BRANCH_TRANSFER',
            reference: result.id,
            byUserId: req.user.id,
          },
        });
      return result;
    });
  }
}
