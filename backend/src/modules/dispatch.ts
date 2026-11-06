import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Cache } from '../redis';
import { Events } from '../realtime';
import { Authed } from '../auth';
import { coordinates, parse, required } from '../common';
import { expandedRadius, rankRiders } from '../domain/dispatch';
import { transitionTx } from './transitions';
@Injectable()
export class DispatchService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Cache) private cache: Cache,
    @Inject(Events) private events: Events,
  ) {}
  async offer(orderId: string) {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: { restaurant: true, offers: true },
    });
    if (
      !order ||
      order.channel !== 'DELIVERY' ||
      !['READY', 'ASSIGNING_RIDER'].includes(order.status) ||
      order.riderId
    )
      return;
    if (order.offers.some((o) => o.status === 'SENT' && o.expiresAt > new Date())) return;
    const profiles = await this.db.riderProfile.findMany({
      where: {
        status: 'ONLINE',
        verified: true,
        lastPingAt: { gte: new Date(Date.now() - 300000) },
      },
      include: {
        orders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } }, select: { id: true } },
      },
    });
    const tried = new Set(
      order.offers.filter((o) => o.expiresAt.getTime() > Date.now() - 120000).map((o) => o.riderId),
    );
    let candidates: ReturnType<typeof rankRiders> = [];
    for (let attempt = 0; attempt < 4 && !candidates.length; attempt++)
      candidates = rankRiders(
        profiles
          .filter((r) => !tried.has(r.userId))
          .map((r) => ({ ...r, active: r.orders.length })),
        order.restaurant,
        expandedRadius(Number(process.env.DISPATCH_RADIUS_KM || 5), attempt),
      );
    if (!candidates.length) {
      this.events.emit(`restaurant:${order.restaurantId}:orders`, 'dispatch.alert', {
        orderId,
        message: 'No rider available. Dispatch will retry.',
      });
      return;
    }
    const offer = await this.db.atomic(async (tx) => {
      const current = required(await tx.order.findUnique({ where: { id: orderId } }));
      if (current.riderId || !['READY', 'ASSIGNING_RIDER'].includes(current.status)) return null;
      if (
        await tx.riderOffer.count({
          where: { orderId, status: 'SENT', expiresAt: { gt: new Date() } },
        })
      )
        return null;
      if (current.status === 'READY')
        await transitionTx(tx, current, 'ASSIGNING_RIDER', 'system:dispatch');
      return tx.riderOffer.create({
        data: {
          orderId,
          riderId: candidates[0].userId,
          expiresAt: new Date(
            Date.now() + Number(process.env.RIDER_OFFER_TTL_SECONDS || 30) * 1000,
          ),
        },
      });
    });
    if (offer) this.events.emit(`user:${offer.riderId}`, 'rider.offer', { id: offer.id });
  }
  async accept(offerId: string, userId: string) {
    const result = await this.db.atomic(async (tx) => {
      const offer = required(
        await tx.riderOffer.findFirst({ where: { id: offerId, riderId: userId } }),
      );
      if (offer.status !== 'SENT' || offer.expiresAt <= new Date())
        throw new ConflictException('This offer expired.');
      const profile = required(await tx.riderProfile.findUnique({ where: { userId } }));
      const active = await tx.order.count({
        where: { riderId: userId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      });
      if (!profile.verified || profile.status !== 'ONLINE' || active >= profile.capacity)
        throw new ConflictException('You are offline, unverified or at delivery capacity.');
      const changed = await tx.order.updateMany({
        where: { id: offer.orderId, riderId: null, status: 'ASSIGNING_RIDER' },
        data: { riderId: userId },
      });
      if (changed.count !== 1)
        throw new ConflictException('Another rider already accepted this order.');
      await tx.riderOffer.updateMany({
        where: { orderId: offer.orderId, status: 'SENT' },
        data: { status: 'REJECTED' },
      });
      await tx.riderOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
      return required(await tx.order.findUnique({ where: { id: offer.orderId } }));
    });
    this.events.order(result, { id: result.id, status: result.status });
    return { orderId: result.id };
  }
}
@Controller('rider')
export class RiderController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Cache) private cache: Cache,
    @Inject(Events) private events: Events,
    @Inject(DispatchService) private dispatch: DispatchService,
  ) {}
  private async profile(req: Authed) {
    if (req.user.role !== 'RIDER') throw new ForbiddenException();
    return required(await this.db.riderProfile.findUnique({ where: { userId: req.user.id } }));
  }
  @Get('profile') async get(@Req() req: Authed) {
    const profile = await this.profile(req);
    const completed = await this.db.order.findMany({
      where: { riderId: req.user.id, status: 'DELIVERED' },
      select: { deliveryFeeMinor: true, tipMinor: true, placedAt: true },
    });
    return {
      ...profile,
      deliveries: completed.length,
      earningsMinor: completed.reduce((s, o) => s + o.deliveryFeeMinor + o.tipMinor, 0),
    };
  }
  @Post('presence') async presence(@Req() req: Authed, @Body() body: unknown) {
    await this.profile(req);
    const data = parse(z.object({ status: z.enum(['ONLINE', 'OFFLINE']), ...coordinates }), body);
    return this.db.riderProfile.update({
      where: { userId: req.user.id },
      data: { ...data, lastPingAt: new Date() },
    });
  }
  @Get('offers') async offers(@Req() req: Authed) {
    await this.profile(req);
    return this.db.riderOffer.findMany({
      where: { riderId: req.user.id, status: 'SENT', expiresAt: { gt: new Date() } },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            restaurant: { select: { name: true, address: true, lat: true, lng: true } },
            deliveryFeeMinor: true,
            tipMinor: true,
          },
        },
      },
    });
  }
  @Post('offers/:id/accept') async accept(@Req() req: Authed, @Param('id') offerId: string) {
    await this.profile(req);
    return this.dispatch.accept(offerId, req.user.id);
  }
  @Post('offers/:id/reject') async reject(@Req() req: Authed, @Param('id') offerId: string) {
    await this.profile(req);
    await this.db.riderOffer.updateMany({
      where: { id: offerId, riderId: req.user.id, status: 'SENT' },
      data: { status: 'REJECTED' },
    });
    return { ok: true };
  }
  @Post('location') async location(@Req() req: Authed, @Body() body: unknown) {
    await this.profile(req);
    const data = parse(z.object(coordinates), body);
    const allowed = await this.cache.redis.set(
      `ping:${req.user.id}`,
      '1',
      'PX',
      Number(process.env.LOCATION_PING_MIN_INTERVAL_MS || 4000),
      'NX',
    );
    if (!allowed) return { throttled: true };
    await this.db.riderProfile.update({
      where: { userId: req.user.id },
      data: { ...data, lastPingAt: new Date() },
    });
    await this.cache.redis.geoadd('riders', data.lng, data.lat, req.user.id);
    await this.db.riderLocationPing.create({ data: { riderId: req.user.id, ...data } });
    const active = await this.db.order.findMany({
      where: { riderId: req.user.id, status: { in: ['ASSIGNING_RIDER', 'PICKED_UP', 'ARRIVING'] } },
    });
    for (const order of active) {
      const payload = { orderId: order.id, ...data, at: new Date().toISOString() };
      this.events.emit(`user:${order.customerId}`, 'rider.location', payload);
      this.events.emit(`restaurant:${order.restaurantId}:orders`, 'rider.location', payload);
    }
    return { ok: true };
  }
  @Post('orders/:id/emergency') async emergency(
    @Req() req: Authed,
    @Param('id') orderId: string,
    @Body() body: unknown,
  ) {
    await this.profile(req);
    const { reason } = parse(z.object({ reason: z.string().min(5).max(300) }), body);
    const order = await this.db.atomic(async (tx) => {
      const order = required(
        await tx.order.findFirst({
          where: {
            id: orderId,
            riderId: req.user.id,
            status: { in: ['ASSIGNING_RIDER', 'PICKED_UP', 'ARRIVING'] },
          },
        }),
      );
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'EMERGENCY_REASSIGN',
          entityId: orderId,
          detail: { reason, previousStatus: order.status },
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'ASSIGNING_RIDER',
          byUserId: req.user.id,
          reason: `Emergency: ${reason}`,
        },
      });
      return tx.order.update({
        where: { id: orderId },
        data: { riderId: null, status: 'ASSIGNING_RIDER' },
      });
    });
    this.events.order(order, {
      id: order.id,
      status: order.status,
      message: 'Your delivery is being reassigned.',
    });
    await this.dispatch.offer(orderId);
    return { ok: true };
  }
}
