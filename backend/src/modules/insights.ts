import { Controller, ForbiddenException, Get, Inject, Param, Req } from '@nestjs/common';
import { Db } from '../db';
import { Authed } from '../auth';
import { managers, required, scope } from '../common';
import { haversine } from '../domain/dispatch';
@Controller()
export class InsightsController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('enterprise/:restaurantId/insights') async insights(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const restaurant = required(
        await this.db.restaurant.findUnique({ where: { id: restaurantId } }),
      ),
      since = new Date(Date.now() - 30 * 86400000);
    const orders = await this.db.order.findMany({
      where: { restaurantId, placedAt: { gte: since } },
      include: { lines: true, customer: { select: { id: true, name: true, email: true } } },
    });
    const completed = orders.filter((o) => ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(o.status));
    const items = await this.db.menuItem.findMany({
      where: { restaurantId, archived: false },
      include: { recipe: { include: { ingredient: true } } },
    });
    const sales = new Map<string, { qty: number; revenueMinor: number }>();
    const guests = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        visits: number;
        spendMinor: number;
        lastVisit: Date;
      }
    >();
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenueMinor: 0 }));
    for (const o of completed) {
      const hour = Number(
        new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: restaurant.timezone,
        }).format(o.placedAt),
      );
      hourly[hour].orders++;
      hourly[hour].revenueMinor += o.grandMinor;
      const guest = guests.get(o.customerId) || {
        ...o.customer,
        visits: 0,
        spendMinor: 0,
        lastVisit: o.placedAt,
      };
      guest.visits++;
      guest.spendMinor += o.grandMinor;
      if (o.placedAt > guest.lastVisit) guest.lastVisit = o.placedAt;
      guests.set(o.customerId, guest);
      for (const l of o.lines) {
        const entry = sales.get(l.menuItemId) || { qty: 0, revenueMinor: 0 };
        entry.qty += l.qty;
        entry.revenueMinor += l.qty * l.unitPriceMinor;
        sales.set(l.menuItemId, entry);
      }
    }
    const engineering = items.map((item) => {
      const sale = sales.get(item.id) || { qty: 0, revenueMinor: 0 };
      const costMinor = Math.round(
        item.recipe.reduce((s, c) => s + Number(c.qty) * c.ingredient.costMinor, 0),
      );
      return {
        id: item.id,
        name: item.name,
        priceMinor: item.priceMinor,
        costMinor,
        marginMinor: item.priceMinor - costMinor,
        marginPercent: item.priceMinor
          ? Math.round(((item.priceMinor - costMinor) / item.priceMinor) * 1000) / 10
          : 0,
        ...sale,
      };
    });
    const meanQty = engineering.reduce((s, i) => s + i.qty, 0) / (engineering.length || 1),
      meanMargin = engineering.reduce((s, i) => s + i.marginPercent, 0) / (engineering.length || 1);
    const members = await this.db.userRestaurantRole.findMany({ where: { restaurantId } }),
      shifts = await this.db.shift.findMany({ where: { restaurantId, startedAt: { gte: since } } }),
      planned = await this.db.scheduledShift.findMany({
        where: { restaurantId, status: 'PLANNED', startsAt: { gte: since } },
      });
    const hours = shifts.reduce(
        (s, sh) =>
          s + (new Date(sh.endedAt || Date.now()).getTime() - sh.startedAt.getTime()) / 3600000,
        0,
      ),
      laborMinor = Math.round(
        shifts.reduce(
          (s, sh) =>
            s +
            ((new Date(sh.endedAt || Date.now()).getTime() - sh.startedAt.getTime()) / 3600000) *
              (members.find((m) => m.userId === sh.userId)?.hourlyRateMinor || 0),
          0,
        ),
      );
    const waste = await this.db.stockMovement.findMany({
      where: { item: { restaurantId }, reason: 'WASTE', createdAt: { gte: since } },
      include: { item: true },
    });
    return {
      periodDays: 30,
      revenueMinor: completed.reduce((s, o) => s + o.grandMinor, 0),
      completedOrders: completed.length,
      cancelledOrders: orders.filter((o) => o.status === 'CANCELLED').length,
      repeatGuests: [...guests.values()].filter((g) => g.visits > 1).length,
      guests: [...guests.values()].sort((a, b) => b.spendMinor - a.spendMinor),
      hourly,
      menuEngineering: engineering.map((i) => ({
        ...i,
        category:
          i.qty >= meanQty
            ? i.marginPercent >= meanMargin
              ? 'STAR'
              : 'PLOWHORSE'
            : i.marginPercent >= meanMargin
              ? 'PUZZLE'
              : 'DOG',
      })),
      labor: {
        hours: Math.round(hours * 10) / 10,
        estimatedCostMinor: laborMinor,
        plannedHours:
          Math.round(
            planned.reduce(
              (s, sh) => s + (sh.endsAt.getTime() - sh.startsAt.getTime()) / 3600000,
              0,
            ) * 10,
          ) / 10,
      },
      wasteCostMinor: Math.round(
        waste.reduce((s, m) => s + Math.abs(Number(m.delta)) * m.item.costMinor, 0),
      ),
    };
  }
  @Get('enterprise/:restaurantId/dispatch') async dispatch(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    return this.db.order.findMany({
      where: { restaurantId, channel: 'DELIVERY', status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      select: {
        id: true,
        number: true,
        status: true,
        placedAt: true,
        scheduledFor: true,
        deliveryAddress: true,
        dropLat: true,
        dropLng: true,
        grandMinor: true,
        rider: {
          select: {
            userId: true,
            lat: true,
            lng: true,
            lastPingAt: true,
            vehicle: true,
            user: { select: { name: true } },
          },
        },
        offers: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            rider: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { placedAt: 'asc' },
    });
  }
  @Get('rider/route') async route(@Req() req: Authed) {
    if (req.user.role !== 'RIDER') throw new ForbiddenException();
    const profile = required(
      await this.db.riderProfile.findUnique({ where: { userId: req.user.id } }),
    );
    const orders = await this.db.order.findMany({
      where: { riderId: req.user.id, status: { in: ['ASSIGNING_RIDER', 'PICKED_UP', 'ARRIVING'] } },
      include: { restaurant: true },
      orderBy: { placedAt: 'asc' },
    });
    const remaining = orders.map((o) => ({
      orderId: o.id,
      number: o.number,
      action: o.status === 'ASSIGNING_RIDER' ? 'PICKUP' : 'DROPOFF',
      address: o.status === 'ASSIGNING_RIDER' ? o.restaurant.address : o.deliveryAddress,
      lat: o.status === 'ASSIGNING_RIDER' ? o.restaurant.lat : o.dropLat,
      lng: o.status === 'ASSIGNING_RIDER' ? o.restaurant.lng : o.dropLng,
    }));
    let origin =
      profile.lat != null && profile.lng != null ? { lat: profile.lat, lng: profile.lng } : null;
    const stops: ((typeof remaining)[number] & { estimatedKm: number | null })[] = [];
    while (remaining.length) {
      let index = 0;
      if (origin) {
        const distances = remaining.map((p) =>
          p.lat != null && p.lng != null
            ? haversine(origin!, { lat: p.lat, lng: p.lng })
            : Infinity,
        );
        index = distances.indexOf(Math.min(...distances));
      }
      const [stop] = remaining.splice(index, 1);
      const estimatedKm =
        origin && stop.lat != null && stop.lng != null
          ? Math.round(haversine(origin, { lat: stop.lat, lng: stop.lng }) * 10) / 10
          : null;
      stops.push({ ...stop, estimatedKm });
      if (stop.lat != null && stop.lng != null) origin = { lat: stop.lat, lng: stop.lng };
    }
    return {
      stops,
      method: 'Nearest next action using straight-line distance; road navigation opens separately.',
    };
  }
}
