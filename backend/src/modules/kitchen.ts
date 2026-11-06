import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { parse, required, scope } from '../common';
import { Events } from '../realtime';
import { transitionTx } from './transitions';
type TicketItem = {
  lineId: string;
  itemId: string;
  name: string;
  qty: number;
  modifiers: { id: string; name: string; inventoryItemId?: string; ingredientQty?: string }[];
};
@Injectable()
export class KitchenService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Events) private events: Events,
  ) {}
  async create(tx: Prisma.TransactionClient, orderId: string) {
    if (await tx.kitchenTicket.count({ where: { orderId } })) return;
    const lines = await tx.orderLine.findMany({ where: { orderId }, include: { item: true } });
    const groups = new Map<string, { stationId: string; course: string; items: TicketItem[] }>();
    const hasStarter = lines.some((l) => l.course === 'STARTER');
    for (const line of lines) {
      const key = `${line.item.stationId}:${line.course}`;
      const group = groups.get(key) || {
        stationId: line.item.stationId,
        course: line.course,
        items: [],
      };
      group.items.push({
        lineId: line.id,
        itemId: line.menuItemId,
        name: line.nameSnapshot,
        qty: line.qty,
        modifiers: line.modifiers as TicketItem['modifiers'],
      });
      groups.set(key, group);
    }
    for (const group of groups.values())
      await tx.kitchenTicket.create({
        data: {
          orderId,
          stationId: group.stationId,
          course: group.course,
          items: group.items as unknown as Prisma.InputJsonValue,
          fireAt: new Date(Date.now() + (hasStarter && group.course === 'MAIN' ? 180000 : 0)),
        },
      });
  }
  async update(ticketId: string, to: string, actor: Authed['user']) {
    const ticket = required(
      await this.db.kitchenTicket.findUnique({
        where: { id: ticketId },
        include: { order: true, station: true },
      }),
    );
    await scope(this.db, actor, ticket.order.restaurantId, [
      'KITCHEN',
      'MANAGER',
      'RESTAURANT_OWNER',
    ]);
    const result = await this.db.atomic(async (tx) => {
      const current = required(await tx.kitchenTicket.findUnique({ where: { id: ticketId } }));
      const next: Record<string, string> = { QUEUED: 'COOKING', COOKING: 'DONE', DONE: 'BUMPED' };
      if (next[current.status] !== to || current.fireAt > new Date())
        throw new ConflictException('This ticket cannot be advanced yet.');
      if (
        ['CANCELLED'].includes(
          required(await tx.order.findUnique({ where: { id: ticket.orderId } })).status,
        )
      )
        throw new ConflictException('Order is cancelled.');
      if (to === 'DONE' && !current.inventoryDeducted) {
        const needs = new Map<string, Prisma.Decimal>();
        for (const line of current.items as unknown as TicketItem[]) {
          const recipe = await tx.recipeComponent.findMany({ where: { menuItemId: line.itemId } });
          for (const component of recipe)
            needs.set(
              component.inventoryItemId,
              (needs.get(component.inventoryItemId) || new Prisma.Decimal(0)).add(
                component.qty.mul(line.qty),
              ),
            );
          for (const m of line.modifiers)
            if (m.inventoryItemId && m.ingredientQty)
              needs.set(
                m.inventoryItemId,
                (needs.get(m.inventoryItemId) || new Prisma.Decimal(0)).add(
                  new Prisma.Decimal(m.ingredientQty).mul(line.qty),
                ),
              );
        }
        for (const [inventoryItemId, qty] of needs) {
          const stock = required(
            await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
          );
          if (stock.qtyOnHand.lessThan(qty))
            throw new ConflictException(
              `Not enough ${stock.name}. Adjust inventory before completing.`,
            );
          await tx.inventoryItem.update({
            where: { id: inventoryItemId },
            data: { qtyOnHand: { decrement: qty } },
          });
          await tx.stockMovement.create({
            data: {
              inventoryItemId,
              delta: qty.negated(),
              reason: 'RECIPE',
              reference: ticketId,
              byUserId: actor.id,
            },
          });
        }
      }
      const result = await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: {
          status: to,
          ...(to === 'DONE' ? { inventoryDeducted: true, doneAt: new Date() } : {}),
        },
      });
      let order = required(await tx.order.findUnique({ where: { id: ticket.orderId } }));
      if (to === 'COOKING' && order.status === 'ACCEPTED')
        order = { ...order, ...(await transitionTx(tx, order, 'IN_KITCHEN', actor.id)) };
      if (
        to === 'DONE' &&
        !(await tx.kitchenTicket.count({
          where: { orderId: order.id, status: { notIn: ['DONE', 'BUMPED', 'VOID'] } },
        }))
      ) {
        if (order.status === 'ACCEPTED')
          order = { ...order, ...(await transitionTx(tx, order, 'IN_KITCHEN', actor.id)) };
        if (order.status === 'IN_KITCHEN') await transitionTx(tx, order, 'READY', actor.id);
      }
      return result;
    });
    const order = required(await this.db.order.findUnique({ where: { id: ticket.orderId } }));
    this.events.emit(`kds:${order.restaurantId}:${ticket.stationId}`, 'ticket.updated', result);
    this.events.order(order, order);
    return result;
  }
}
@Controller('kds')
export class KitchenController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(KitchenService) private kitchen: KitchenService,
  ) {}
  @Get(':restaurantId') async list(
    @Param('restaurantId') restaurantId: string,
    @Query('station') station: string | undefined,
    @Req() req: Authed,
  ) {
    await scope(this.db, req.user, restaurantId, ['KITCHEN', 'MANAGER', 'RESTAURANT_OWNER']);
    return this.db.kitchenTicket.findMany({
      where: {
        order: { restaurantId },
        ...(station ? { stationId: station } : {}),
        status: { notIn: ['BUMPED', 'VOID'] },
      },
      include: { station: true, order: { include: { check: { include: { table: true } } } } },
      orderBy: { fireAt: 'asc' },
    });
  }
  @Patch(':id') update(@Param('id') ticketId: string, @Body() body: unknown, @Req() req: Authed) {
    const { status } = parse(z.object({ status: z.enum(['COOKING', 'DONE', 'BUMPED']) }), body);
    return this.kitchen.update(ticketId, status, req.user);
  }
}
