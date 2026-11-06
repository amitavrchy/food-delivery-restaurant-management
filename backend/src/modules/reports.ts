import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { Db } from '../db';
import { Authed } from '../auth';
import { managers, parse, scope } from '../common';
import { z } from 'zod';
@Controller('reports')
export class ReportsController {
  constructor(@Inject(Db) private db: Db) {}
  @Get(':restaurantId') async report(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Authed,
    @Query('days') days = '7',
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const period = parse(z.coerce.number().int().min(1).max(90), days);
    const since = new Date(Date.now() - period * 86400000);
    const orders = await this.db.order.findMany({
      where: { restaurantId, placedAt: { gte: since } },
      include: { lines: true },
    });
    const completed = orders.filter((o) => ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(o.status));
    const revenue = completed.reduce((s, o) => s + o.grandMinor, 0);
    const ingredients = await this.db.inventoryItem.findMany({
      where: { restaurantId },
      include: { movements: { where: { reason: 'RECIPE', createdAt: { gte: since } } } },
    });
    const cost = Math.round(
      ingredients.reduce(
        (s, i) => s + i.movements.reduce((v, m) => v + Math.abs(Number(m.delta)) * i.costMinor, 0),
        0,
      ),
    );
    const active = orders.filter(
      (o) => !['DELIVERED', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status),
    );
    const channels = ['DELIVERY', 'DINE_IN', 'TAKEAWAY'].map((channel) => ({
      channel,
      count: completed.filter((o) => o.channel === channel).length,
      revenueMinor: completed
        .filter((o) => o.channel === channel)
        .reduce((s, o) => s + o.grandMinor, 0),
    }));
    const daily = Array.from({ length: period }, (_, i) => {
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() - (period - 1 - i) * 86400000));
      const matches = completed.filter(
        (o) =>
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(o.placedAt) === day,
      );
      return {
        day,
        revenueMinor: matches.reduce((s, o) => s + o.grandMinor, 0),
        orders: matches.length,
      };
    });
    const popular = new Map<string, { name: string; qty: number; revenueMinor: number }>();
    for (const order of completed)
      for (const line of order.lines) {
        const item = popular.get(line.menuItemId) || {
          name: line.nameSnapshot,
          qty: 0,
          revenueMinor: 0,
        };
        item.qty += line.qty;
        item.revenueMinor += line.qty * line.unitPriceMinor;
        popular.set(line.menuItemId, item);
      }
    const tickets = await this.db.kitchenTicket.findMany({
      where: { order: { restaurantId }, doneAt: { gte: since } },
      select: { fireAt: true, doneAt: true },
    });
    return {
      period,
      revenueMinor: revenue,
      totalOrders: orders.length,
      completedOrders: completed.length,
      activeOrders: active.length,
      averageTicketMinor: completed.length ? Math.round(revenue / completed.length) : 0,
      foodCostMinor: cost,
      foodCostPercent: revenue ? Math.round((cost / revenue) * 1000) / 10 : 0,
      avgPrepMinutes: tickets.length
        ? Math.round(
            tickets.reduce(
              (s, t) => s + Math.max(0, t.doneAt!.getTime() - t.fireAt.getTime()) / 60000,
              0,
            ) / tickets.length,
          )
        : 0,
      channels,
      daily,
      popular: [...popular.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
      lowStock: ingredients.filter((i) => i.qtyOnHand.lessThanOrEqualTo(i.lowStockQty)).length,
    };
  }
}
