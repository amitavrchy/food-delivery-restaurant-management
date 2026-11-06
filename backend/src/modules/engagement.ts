import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed, Public } from '../auth';
import { id, managers, money, parse, required, scope } from '../common';

@Controller()
export class EngagementController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('account/addresses') addresses(@Req() req: Authed) {
    return this.db.customerAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }
  @Post('account/addresses') async address(@Req() req: Authed, @Body() body: unknown) {
    const data = parse(
      z.object({
        label: z.string().trim().min(1).max(40),
        address: z.string().trim().min(8).max(500),
        phone: z.string().min(7).max(25),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        isDefault: z.boolean().default(false),
      }),
      body,
    );
    if ((data.lat == null) !== (data.lng == null))
      throw new ConflictException('Provide both latitude and longitude.');
    return this.db.atomic(async (tx) => {
      const count = await tx.customerAddress.count({ where: { userId: req.user.id } });
      if (count >= 20) throw new ConflictException('You can save up to 20 addresses.');
      const primary = data.isDefault || count === 0;
      if (primary)
        await tx.customerAddress.updateMany({
          where: { userId: req.user.id },
          data: { isDefault: false },
        });
      return tx.customerAddress.create({
        data: { ...data, userId: req.user.id, isDefault: primary },
      });
    });
  }
  @Patch('account/addresses/:id/default') async defaultAddress(
    @Req() req: Authed,
    @Param('id') addressId: string,
  ) {
    return this.db.atomic(async (tx) => {
      required(
        await tx.customerAddress.findFirst({ where: { id: addressId, userId: req.user.id } }),
      );
      await tx.customerAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
      return tx.customerAddress.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }
  @Delete('account/addresses/:id') async deleteAddress(
    @Req() req: Authed,
    @Param('id') addressId: string,
  ) {
    return this.db.atomic(async (tx) => {
      const address = required(
        await tx.customerAddress.findFirst({ where: { id: addressId, userId: req.user.id } }),
      );
      await tx.customerAddress.delete({ where: { id: addressId } });
      if (address.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { userId: req.user.id },
          orderBy: { createdAt: 'desc' },
        });
        if (next)
          await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      return { ok: true };
    });
  }
  @Get('account/favorites') favorites(@Req() req: Authed) {
    return this.db.favoriteRestaurant.findMany({
      where: { userId: req.user.id },
      include: { restaurant: true },
    });
  }
  @Post('account/favorites/:id') async favorite(
    @Req() req: Authed,
    @Param('id') restaurantId: string,
  ) {
    required(await this.db.restaurant.findFirst({ where: { id: restaurantId, status: 'ACTIVE' } }));
    return this.db.favoriteRestaurant.upsert({
      where: { userId_restaurantId: { userId: req.user.id, restaurantId } },
      create: { userId: req.user.id, restaurantId },
      update: {},
    });
  }
  @Delete('account/favorites/:id') async unfavorite(
    @Req() req: Authed,
    @Param('id') restaurantId: string,
  ) {
    await this.db.favoriteRestaurant.deleteMany({ where: { userId: req.user.id, restaurantId } });
    return { ok: true };
  }
  @Get('account/loyalty') async loyalty(@Req() req: Authed) {
    const balance = await this.db.loyaltyEntry.aggregate({
      where: { userId: req.user.id },
      _sum: { points: true },
    });
    return {
      points: balance._sum.points || 0,
      pointValueMinor: 100,
      earnRule: 'One point per ৳100 of completed food purchases. One point gives ৳1 off food.',
      entries: await this.db.loyaltyEntry.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    };
  }
  @Get('notifications') async notifications(@Req() req: Authed) {
    return {
      unread: await this.db.notification.count({ where: { userId: req.user.id, readAt: null } }),
      items: await this.db.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    };
  }
  @Patch('notifications/:id/read') async read(
    @Req() req: Authed,
    @Param('id') notificationId: string,
  ) {
    await this.db.notification.updateMany({
      where: { id: notificationId, userId: req.user.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Post('notifications/read-all') async readAll(@Req() req: Authed) {
    await this.db.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Public() @Get('promotions') promotions(@Query('restaurantId') restaurantId?: string) {
    return this.db.promoCode.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ restaurantId: null }, ...(restaurantId ? [{ restaurantId }] : [])] },
        ],
      },
      take: 50,
      orderBy: { code: 'asc' },
    });
  }
  @Get('marketing/:restaurantId') async marketing(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    return this.db.promoCode.findMany({
      where: { restaurantId },
      include: { _count: { select: { redemptions: true } } },
      orderBy: { code: 'asc' },
    });
  }
  @Post('marketing/:restaurantId') async createPromo(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        code: z.string().regex(/^[A-Z0-9]{3,30}$/),
        type: z.enum(['PERCENT', 'FIXED']),
        value: z.number().int().positive().max(1000000),
        minOrderMinor: money,
        maxDiscountMinor: money,
        maxRedemptions: z.number().int().positive().max(1000000),
        maxPerCustomer: z.number().int().positive().max(1000),
        expiresAt: z.iso.datetime({ offset: true }).optional(),
      }),
      body,
    );
    if (data.type === 'PERCENT' && data.value > 100)
      throw new ConflictException('Percentage cannot exceed 100.');
    if (data.expiresAt && new Date(data.expiresAt) <= new Date())
      throw new ConflictException('Expiry must be in the future.');
    return this.db.promoCode.create({
      data: { ...data, restaurantId, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null },
    });
  }
  @Patch('marketing/promotions/:id') async togglePromo(
    @Req() req: Authed,
    @Param('id') promoId: string,
    @Body() body: unknown,
  ) {
    const promo = required(await this.db.promoCode.findUnique({ where: { id: promoId } }));
    if (promo.restaurantId) await scope(this.db, req.user, promo.restaurantId, managers);
    else if (req.user.role !== 'PLATFORM_ADMIN') throw new ForbiddenException();
    const { active } = parse(z.object({ active: z.boolean() }), body);
    return this.db.promoCode.update({ where: { id: promoId }, data: { active } });
  }
}

@Controller('support')
export class SupportController {
  constructor(@Inject(Db) private db: Db) {}
  private async access(req: Authed, ticketId: string) {
    const ticket = required(await this.db.supportTicket.findUnique({ where: { id: ticketId } }));
    if (ticket.userId !== req.user.id)
      await scope(this.db, req.user, ticket.restaurantId, managers);
    return ticket;
  }
  @Get() async list(@Req() req: Authed, @Query('restaurantId') restaurantId?: string) {
    if (restaurantId) await scope(this.db, req.user, restaurantId, managers);
    return this.db.supportTicket.findMany({
      where: restaurantId
        ? { restaurantId }
        : req.user.role === 'PLATFORM_ADMIN'
          ? {}
          : { userId: req.user.id },
      include: {
        order: { select: { id: true, number: true, grandMinor: true } },
        messages: {
          include: { author: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }
  @Post() async create(@Req() req: Authed, @Body() body: unknown) {
    const data = parse(
      z.object({
        orderId: id,
        category: z.enum(['LATE_DELIVERY', 'MISSING_ITEM', 'QUALITY', 'PAYMENT', 'OTHER']),
        subject: z.string().trim().min(5).max(150),
        message: z.string().trim().min(10).max(3000),
      }),
      body,
    );
    const order = required(
      await this.db.order.findFirst({ where: { id: data.orderId, customerId: req.user.id } }),
    );
    return this.db.atomic(async (tx) => {
      if (
        await tx.supportTicket.count({
          where: {
            orderId: order.id,
            userId: req.user.id,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
        })
      )
        throw new ConflictException('You already have an open case for this order.');
      return tx.supportTicket.create({
        data: {
          orderId: order.id,
          restaurantId: order.restaurantId,
          userId: req.user.id,
          category: data.category,
          subject: data.subject,
          messages: { create: { authorId: req.user.id, body: data.message } },
        },
      });
    });
  }
  @Post(':id/messages') async message(
    @Req() req: Authed,
    @Param('id') ticketId: string,
    @Body() body: unknown,
  ) {
    const ticket = await this.access(req, ticketId);
    if (ticket.status === 'RESOLVED')
      throw new ConflictException('Reopen the case before replying.');
    const { message } = parse(z.object({ message: z.string().trim().min(1).max(3000) }), body);
    return this.db.atomic(async (tx) => {
      const result = await tx.supportMessage.create({
        data: { ticketId, authorId: req.user.id, body: message },
      });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      if (ticket.userId !== req.user.id)
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            kind: 'SUPPORT',
            title: 'Your support team replied',
            body: ticket.subject,
            href: '/account?tab=support',
          },
        });
      return result;
    });
  }
  @Patch(':id') async resolve(
    @Req() req: Authed,
    @Param('id') ticketId: string,
    @Body() body: unknown,
  ) {
    const ticket = await this.access(req, ticketId);
    await scope(this.db, req.user, ticket.restaurantId, managers);
    const data = parse(
      z.object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
        refundMinor: money.default(0),
        refundReference: z.string().max(150).optional(),
        resolution: z.string().trim().min(5).max(1000),
      }),
      body,
    );
    const order = required(await this.db.order.findUnique({ where: { id: ticket.orderId } }));
    if (data.refundMinor > order.grandMinor)
      throw new ConflictException('Refund record exceeds the order total.');
    if (data.refundMinor > 0 && !data.refundReference)
      throw new ConflictException(
        'Record the external refund reference; this action does not move money.',
      );
    return this.db.atomic(async (tx) => {
      const otherRefunds = await tx.supportTicket.aggregate({
        where: { orderId: ticket.orderId, id: { not: ticketId } },
        _sum: { refundMinor: true },
      });
      if ((otherRefunds._sum.refundMinor || 0) + data.refundMinor > order.grandMinor)
        throw new ConflictException('Combined refund records exceed the order total.');
      const result = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: data.status,
          refundMinor: data.refundMinor,
          refundReference: data.refundReference,
        },
      });
      await tx.supportMessage.create({
        data: { ticketId, authorId: req.user.id, body: data.resolution },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'SUPPORT_RESOLUTION',
          entityId: ticketId,
          detail: data,
        },
      });
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          kind: 'SUPPORT',
          title: 'Your support case was updated',
          body: data.resolution,
          href: '/account?tab=support',
        },
      });
      return result;
    });
  }
}
