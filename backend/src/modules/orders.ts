import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { Actor, id, key, money, parse, required, scope } from '../common';
import { Events } from '../realtime';
import { price } from '../domain/pricing';
import { KitchenService } from './kitchen';
import { transitionTx } from './transitions';
import { haversine } from '../domain/dispatch';
import { stripeEnabled } from './stripe';
export const orderInclude = {
  restaurant: true,
  lines: true,
  history: { orderBy: { at: 'asc' as const } },
  rider: { select: { userId: true, vehicle: true, user: { select: { name: true } } } },
  rating: true,
  payments: {
    select: {
      id: true,
      provider: true,
      status: true,
      amountMinor: true,
      createdAt: true,
      refunds: { select: { id: true, amountMinor: true, status: true, createdAt: true } },
    },
  },
  proofs: { select: { id: true, createdAt: true, mimeType: true } },
};
export const checkoutSchema = z.object({
  restaurantId: id,
  channel: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN']),
  tableCheckId: id.optional(),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  redeemPoints: z.number().int().min(0).max(100000).default(0),
  lines: z
    .array(
      z.object({
        menuItemId: id,
        qty: z.number().int().min(1).max(30),
        modifierIds: z.array(id).max(20).default([]),
        seat: z.number().int().min(1).max(30).default(1),
        course: z.enum(['STARTER', 'MAIN', 'DESSERT']).default('MAIN'),
      }),
    )
    .min(1)
    .max(50),
  deliveryAddress: z.string().trim().min(8).max(500).optional(),
  deliveryPhone: z.string().trim().min(7).max(25).optional(),
  dropLat: z.number().min(-90).max(90).optional(),
  dropLng: z.number().min(-180).max(180).optional(),
  promoCode: z.string().max(30).optional(),
  tipMinor: money.default(0),
  notes: z.string().max(500).default(''),
  paymentMethod: z.enum(['COD', 'COUNTER', 'STRIPE']).default('COD'),
  idempotencyKey: key,
});
@Injectable()
export class Orders {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(KitchenService) private kitchen: KitchenService,
    @Inject(Events) private events: Events,
  ) {}
  async access(actor: Actor, orderId: string) {
    const order = required(
      await this.db.order.findUnique({ where: { id: orderId }, include: orderInclude }),
    );
    if (order.customerId !== actor.id && order.riderId !== actor.id)
      await scope(this.db, actor, order.restaurantId);
    return order;
  }
  async create(actor: Actor, body: unknown) {
    const data = parse(checkoutSchema, body);
    if (data.paymentMethod === 'STRIPE' && !stripeEnabled())
      throw new BadRequestException('Card payment is not configured.');
    if (data.paymentMethod === 'STRIPE' && data.channel === 'DINE_IN')
      throw new BadRequestException('Settle dine-in cards using the external counter terminal.');
    if (data.channel === 'DINE_IN')
      await scope(this.db, actor, data.restaurantId, [
        'WAITER',
        'CASHIER',
        'MANAGER',
        'RESTAURANT_OWNER',
      ]);
    const otp = String(randomInt(100000, 1000000));
    let created = false;
    const result = await this.db.atomic(async (tx) => {
      created = false;
      const existing = await tx.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: orderInclude,
      });
      if (existing) {
        if (existing.customerId !== actor.id) throw new ConflictException();
        return existing;
      }
      const restaurant = required(
        await tx.restaurant.findUnique({ where: { id: data.restaurantId } }),
      );
      if (restaurant.status !== 'ACTIVE' || (data.channel === 'DELIVERY' && !restaurant.isOnline))
        throw new ConflictException('This restaurant has paused delivery orders.');
      if (data.channel === 'DELIVERY' && !data.deliveryAddress)
        throw new BadRequestException('A delivery address is required.');
      if ((data.dropLat == null) !== (data.dropLng == null))
        throw new BadRequestException('Provide both delivery coordinates.');
      if (
        data.channel === 'DELIVERY' &&
        data.dropLat != null &&
        data.dropLng != null &&
        haversine(restaurant, { lat: data.dropLat, lng: data.dropLng }) >
          restaurant.deliveryRadiusKm
      )
        throw new ConflictException('This address is outside the restaurant’s delivery area.');
      const scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;
      if (
        scheduledFor &&
        (data.channel === 'DINE_IN' ||
          scheduledFor.getTime() < Date.now() + 30 * 60000 ||
          scheduledFor.getTime() > Date.now() + 7 * 86400000)
      )
        throw new BadRequestException(
          'Schedule delivery or takeaway between 30 minutes and seven days ahead.',
        );
      const requestedTime = scheduledFor || new Date();
      const day = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: restaurant.timezone })
        .format(requestedTime)
        .toUpperCase();
      const hour = Number(
        new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: restaurant.timezone,
        }).format(requestedTime),
      );
      const window = (
        restaurant.openingHours as Record<string, { open: number; close: number; closed: boolean }>
      )[day];
      if (
        data.channel !== 'DINE_IN' &&
        window &&
        (window.closed || hour < window.open || hour >= window.close)
      )
        throw new ConflictException('The restaurant is closed at the requested time.');
      if (data.channel === 'DINE_IN') {
        if (!data.tableCheckId) throw new BadRequestException('Select an open table check.');
        required(
          await tx.tableCheck.findFirst({
            where: {
              id: data.tableCheckId,
              status: 'OPEN',
              table: { restaurantId: restaurant.id },
            },
          }),
        );
      } else if (data.tableCheckId)
        throw new BadRequestException('Only dine in orders can have a table check.');
      const lines = [];
      const localHour = Number(
        new Intl.DateTimeFormat('en', {
          timeZone: restaurant.timezone,
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(scheduledFor || new Date()),
      );
      for (const line of data.lines) {
        const item = required(
          await tx.menuItem.findFirst({
            where: { id: line.menuItemId, restaurantId: restaurant.id, archived: false },
            include: { modifierGroups: { include: { options: true } } },
          }),
        );
        if (!item.isAvailable || localHour < item.availableFrom || localHour >= item.availableUntil)
          throw new ConflictException(`${item.name} is currently unavailable.`);
        if (new Set(line.modifierIds).size !== line.modifierIds.length)
          throw new BadRequestException('Duplicate modifiers.');
        const available = item.modifierGroups.flatMap((g) => g.options);
        const modifiers = line.modifierIds.map((optionId) =>
          required(
            available.find((o) => o.id === optionId),
            'Modifier is not valid for this item.',
          ),
        );
        for (const group of item.modifierGroups) {
          const count = modifiers.filter((m) => m.groupId === group.id).length;
          if (count < group.minSelect || count > group.maxSelect)
            throw new BadRequestException(
              `Choose ${group.minSelect}–${group.maxSelect} options for ${group.name}.`,
            );
        }
        lines.push({
          menuItemId: item.id,
          nameSnapshot: item.name,
          qty: line.qty,
          unitPriceMinor: item.priceMinor + modifiers.reduce((s, m) => s + m.priceDeltaMinor, 0),
          seat: line.seat,
          course: line.course,
          modifiers: modifiers.map((m) => ({
            id: m.id,
            name: m.name,
            priceDeltaMinor: m.priceDeltaMinor,
            inventoryItemId: m.inventoryItemId,
            ingredientQty: m.ingredientQty.toString(),
          })),
        });
      }
      const goods = lines.reduce((s, l) => s + l.qty * l.unitPriceMinor, 0);
      if (data.channel === 'DELIVERY' && goods < restaurant.minOrderMinor)
        throw new ConflictException('This cart is below the restaurant’s minimum delivery order.');
      let discount = 0;
      let appliedPromo: { id: string; discount: number } | null = null;
      if (data.promoCode) {
        const promo = await tx.promoCode.findUnique({
          where: { code: data.promoCode.toUpperCase() },
        });
        if (
          !promo ||
          !promo.active ||
          (promo.expiresAt && promo.expiresAt < new Date()) ||
          (promo.startsAt && promo.startsAt > new Date()) ||
          (promo.restaurantId && promo.restaurantId !== restaurant.id) ||
          goods < promo.minOrderMinor
        )
          throw new BadRequestException('Promo is invalid, expired or below its minimum order.');
        if (
          (await tx.promoRedemption.count({ where: { promoId: promo.id } })) >=
            promo.maxRedemptions ||
          (await tx.promoRedemption.count({
            where: { promoId: promo.id, customerId: actor.id },
          })) >= promo.maxPerCustomer
        )
          throw new ConflictException('This promotion has reached its redemption limit.');
        discount = Math.min(
          promo.maxDiscountMinor,
          promo.type === 'PERCENT' ? Math.round((goods * promo.value) / 100) : promo.value,
        );
        appliedPromo = { id: promo.id, discount };
      }
      if (data.redeemPoints) {
        if (!restaurant.loyaltyEnabled)
          throw new ConflictException('Rewards are not enabled at this restaurant.');
        const points =
          (await tx.loyaltyEntry.aggregate({ where: { userId: actor.id }, _sum: { points: true } }))
            ._sum.points || 0;
        if (
          data.redeemPoints > points ||
          data.redeemPoints * 100 > goods - Math.min(goods, discount)
        )
          throw new ConflictException(
            'Not enough reward points or food balance for this redemption.',
          );
        discount += data.redeemPoints * 100;
      }
      const order = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          customerId: actor.id,
          channel: data.channel,
          tableCheckId: data.tableCheckId,
          deliveryAddress: data.deliveryAddress,
          deliveryPhone: data.deliveryPhone,
          dropLat: data.dropLat,
          dropLng: data.dropLng,
          notes: data.notes,
          scheduledFor,
          loyaltyRedeemed: data.redeemPoints,
          idempotencyKey: data.idempotencyKey,
          otpHash: data.channel === 'DELIVERY' ? await hash(otp, 10) : null,
          ...price(
            goods,
            data.channel,
            restaurant.deliveryFeeMinor,
            discount,
            data.tipMinor,
            restaurant.taxBps,
            restaurant.serviceBps,
          ),
          lines: { create: lines as unknown as Prisma.OrderLineCreateWithoutOrderInput[] },
          history: { create: { toStatus: 'PLACED', byUserId: actor.id } },
        },
      });
      if (appliedPromo)
        await tx.promoRedemption.create({
          data: {
            promoId: appliedPromo.id,
            orderId: order.id,
            customerId: actor.id,
            discountMinor: appliedPromo.discount,
          },
        });
      if (data.redeemPoints)
        await tx.loyaltyEntry.create({
          data: {
            userId: actor.id,
            orderId: order.id,
            kind: 'REDEEM',
            points: -data.redeemPoints,
            reason: 'Reward points applied at checkout',
          },
        });
      await tx.notification.create({
        data: {
          userId: actor.id,
          kind: 'ORDER',
          title: `Order #${order.number} placed`,
          body: scheduledFor
            ? 'Your scheduled order is saved.'
            : 'Your order has been sent to the restaurant.',
          href: `/orders/${order.id}`,
        },
      });
      const recipients = await tx.userRestaurantRole.findMany({
        where: { restaurantId: restaurant.id, role: { in: ['RESTAURANT_OWNER', 'MANAGER'] } },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: [...new Set(recipients.map((r) => r.userId))]
          .filter((userId) => userId !== actor.id)
          .map((userId) => ({
            userId,
            kind: 'ORDER',
            title: `Incoming order #${order.number}`,
            body: scheduledFor
              ? 'A scheduled order is waiting.'
              : 'A new order needs your kitchen.',
            href: '/restaurant/orders',
          })),
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: data.channel === 'DINE_IN' ? 'COUNTER' : data.paymentMethod,
          amountMinor: order.grandMinor,
          idempotencyKey: `order:${data.idempotencyKey}`,
        },
      });
      if (
        data.paymentMethod !== 'STRIPE' &&
        (restaurant.autoAccept || data.channel === 'DINE_IN') &&
        (!scheduledFor || scheduledFor.getTime() <= Date.now() + 30 * 60000)
      ) {
        await transitionTx(tx, order, 'ACCEPTED', actor.id);
        await this.kitchen.create(tx, order.id);
      }
      created = true;
      return required(
        await tx.order.findUnique({ where: { id: order.id }, include: orderInclude }),
      );
    });
    // OTP is returned only to the placing customer, and never included in rider payloads.
    this.events.order(result, { id: result.id, status: result.status });
    return {
      ...this.safe(result, actor),
      ...(result.channel === 'DELIVERY' && created ? { deliveryOtp: otp } : {}),
    };
  }
  safe<
    T extends {
      otpHash?: string | null;
      customerId: string;
      dropLat?: number | null;
      dropLng?: number | null;
    },
  >(order: T, actor: Actor) {
    const { otpHash, ...safe } = order;
    return safe;
  }
  async transition(actor: Actor, orderId: string, body: unknown) {
    const data = parse(
      z.object({
        status: z.enum([
          'ACCEPTED',
          'IN_KITCHEN',
          'READY',
          'SERVED',
          'CLOSED',
          'COMPLETED',
          'CANCELLED',
          'PICKED_UP',
          'ARRIVING',
          'DELIVERED',
        ]),
        reason: z.string().min(3).max(300).optional(),
        otp: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        managerPin: z.string().max(20).optional(),
      }),
      body,
    );
    const initial = await this.access(actor, orderId);
    if (
      data.status === 'ACCEPTED' &&
      initial.scheduledFor &&
      initial.scheduledFor.getTime() > Date.now() + 30 * 60000
    )
      throw new ConflictException(
        'Scheduled orders can enter the kitchen 30 minutes before their requested time.',
      );
    let restaurant = false;
    if (['PICKED_UP', 'ARRIVING', 'DELIVERED'].includes(data.status)) {
      if (initial.riderId !== actor.id)
        throw new ForbiddenException('Only the assigned rider can update delivery.');
      if (
        data.status === 'DELIVERED' &&
        (!data.otp || !initial.otpHash || !(await compare(data.otp, initial.otpHash)))
      )
        throw new BadRequestException('The customer delivery code is incorrect.');
    } else if (
      data.status === 'CANCELLED' &&
      initial.customerId === actor.id &&
      actor.role === 'CUSTOMER'
    ) {
      if (!['PLACED', 'ACCEPTED'].includes(initial.status))
        throw new ConflictException('The kitchen has started. Contact the restaurant to cancel.');
    } else {
      await scope(this.db, actor, initial.restaurantId, [
        'RESTAURANT_OWNER',
        'MANAGER',
        'CASHIER',
        'WAITER',
      ]);
      restaurant = true;
    }
    if (data.status === 'CANCELLED' && !data.reason)
      throw new BadRequestException('A cancellation reason is required.');
    if (
      data.status === 'CANCELLED' &&
      initial.channel === 'DINE_IN' &&
      initial.status !== 'PLACED'
    ) {
      await scope(this.db, actor, initial.restaurantId, ['RESTAURANT_OWNER', 'MANAGER']);
      if (data.managerPin !== process.env.MANAGER_PIN)
        throw new ForbiddenException('Manager PIN required after send.');
    }
    await this.db.atomic(async (tx) => {
      const order = required(await tx.order.findUnique({ where: { id: orderId } }));
      if (
        data.status === 'ACCEPTED' &&
        (await tx.payment.count({
          where: { orderId, provider: 'STRIPE', status: { not: 'CAPTURED' } },
        }))
      )
        throw new ConflictException(
          'Wait for card payment confirmation before accepting this order.',
        );
      if (['IN_KITCHEN', 'READY'].includes(data.status)) {
        const unfinished = await tx.kitchenTicket.count({
          where: { orderId, status: { notIn: ['DONE', 'BUMPED', 'VOID'] } },
        });
        if (data.status === 'READY' && unfinished)
          throw new ConflictException('Complete all kitchen tickets first.');
      }
      if (data.status === 'CLOSED' && order.tableCheckId)
        throw new ConflictException('Close this order by settling the table check.');
      await transitionTx(tx, order, data.status, actor.id, data.reason, restaurant);
      if (data.status === 'ACCEPTED') await this.kitchen.create(tx, orderId);
      if (data.status === 'CANCELLED') {
        await tx.kitchenTicket.updateMany({
          where: { orderId, status: { in: ['QUEUED', 'COOKING'] } },
          data: { status: 'VOID' },
        });
        await tx.riderOffer.updateMany({
          where: { orderId, status: 'SENT' },
          data: { status: 'REJECTED' },
        });
        await tx.payment.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
      if (['DELIVERED', 'COMPLETED'].includes(data.status))
        await tx.payment.updateMany({
          where: { orderId, provider: { in: ['COD', 'COUNTER'] }, status: 'PENDING' },
          data: { status: 'CAPTURED' },
        });
    });
    const result = await this.access(actor, orderId);
    this.events.order(result, { id: result.id, status: result.status });
    return this.safe(result, actor);
  }
}
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Orders) private orders: Orders,
  ) {}
  @Post() create(@Req() req: Authed, @Body() body: unknown) {
    return this.orders.create(req.user, body);
  }
  @Get() async list(@Req() req: Authed, @Query('restaurantId') restaurantId?: string) {
    if (restaurantId) await scope(this.db, req.user, restaurantId);
    const orders = await this.db.order.findMany({
      where: restaurantId
        ? { restaurantId }
        : req.user.role === 'RIDER'
          ? { riderId: req.user.id }
          : { customerId: req.user.id },
      include: orderInclude,
      orderBy: { placedAt: 'desc' },
      take: 100,
    });
    return orders.map((o) => this.orders.safe(o, req.user));
  }
  @Get(':id') async get(@Param('id') orderId: string, @Req() req: Authed) {
    return this.orders.safe(await this.orders.access(req.user, orderId), req.user);
  }
  @Get(':id/tracking') async tracking(@Param('id') orderId: string, @Req() req: Authed) {
    const order = await this.orders.access(req.user, orderId);
    if (!order.riderId || !['ASSIGNING_RIDER', 'PICKED_UP', 'ARRIVING'].includes(order.status))
      return { location: null };
    const rider = await this.db.riderProfile.findUnique({
      where: { userId: order.riderId },
      select: { lat: true, lng: true, lastPingAt: true },
    });
    return {
      location:
        rider?.lat != null &&
        rider.lng != null &&
        rider.lastPingAt &&
        rider.lastPingAt.getTime() > Date.now() - 300000
          ? { lat: rider.lat, lng: rider.lng, at: rider.lastPingAt.toISOString() }
          : null,
    };
  }
  @Patch(':id/status') transition(
    @Param('id') orderId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    return this.orders.transition(req.user, orderId, body);
  }
  @Post(':id/rating') async rate(
    @Param('id') orderId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const order = await this.orders.access(req.user, orderId);
    if (
      order.customerId !== req.user.id ||
      !['DELIVERED', 'COMPLETED', 'CLOSED'].includes(order.status)
    )
      throw new ForbiddenException('Rate your completed orders only.');
    const data = parse(
      z.object({
        stars: z.number().int().min(1).max(5),
        comment: z.string().trim().max(500),
        riderStars: z.number().int().min(1).max(5).optional(),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      if (data.riderStars && !order.riderId)
        throw new BadRequestException('This order has no delivery rider.');
      const result = await tx.rating.upsert({
        where: { orderId },
        create: { orderId, ...data },
        update: data,
      });
      if (data.riderStars && order.riderId) {
        const ratings = await tx.rating.aggregate({
          where: { order: { riderId: order.riderId }, riderStars: { not: null } },
          _avg: { riderStars: true },
        });
        await tx.riderProfile.update({
          where: { userId: order.riderId },
          data: { ratingAvg: ratings._avg.riderStars || 5 },
        });
      }
      return result;
    });
  }
}
