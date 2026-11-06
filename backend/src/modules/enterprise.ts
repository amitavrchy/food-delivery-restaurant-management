import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { id, managers, money, parse, required, scope } from '../common';
@Controller()
export class EnterpriseController {
  constructor(@Inject(Db) private db: Db) {}
  private async organization(req: Authed, organizationId: string) {
    const organization = required(
      await this.db.organization.findUnique({ where: { id: organizationId } }),
    );
    if (req.user.role !== 'PLATFORM_ADMIN' && organization.ownerId !== req.user.id)
      throw new ForbiddenException('Only this organization’s owner may manage its branches.');
    return organization;
  }
  @Get('organizations') organizations(@Req() req: Authed) {
    return this.db.organization.findMany({
      where: req.user.role === 'PLATFORM_ADMIN' ? {} : { ownerId: req.user.id },
      include: {
        owner: { select: { name: true, email: true } },
        restaurants: {
          include: { _count: { select: { orders: true, staff: true, items: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
  @Post('organizations') async createOrganization(@Req() req: Authed, @Body() body: unknown) {
    const data = parse(
      z.object({ name: z.string().trim().min(2).max(100), ownerEmail: z.email().optional() }),
      body,
    );
    if (!['PLATFORM_ADMIN', 'RESTAURANT_OWNER'].includes(req.user.role))
      throw new ForbiddenException();
    const owner = data.ownerEmail
      ? required(
          await this.db.user.findUnique({ where: { email: data.ownerEmail.toLowerCase() } }),
          'Register the owner account first.',
        )
      : required(await this.db.user.findUnique({ where: { id: req.user.id } }));
    if (owner.id !== req.user.id && req.user.role !== 'PLATFORM_ADMIN')
      throw new ForbiddenException();
    if (!['CUSTOMER', 'RESTAURANT_OWNER', 'MANAGER', 'PLATFORM_ADMIN'].includes(owner.role))
      throw new ConflictException('Choose a customer or owner account for this organization.');
    return this.db.atomic(async (tx) => {
      if (owner.role === 'CUSTOMER' || owner.role === 'MANAGER')
        await tx.user.update({ where: { id: owner.id }, data: { role: 'RESTAURANT_OWNER' } });
      return tx.organization.create({ data: { name: data.name, ownerId: owner.id } });
    });
  }
  @Post('organizations/:id/branches') async branch(
    @Req() req: Authed,
    @Param('id') organizationId: string,
    @Body() body: unknown,
  ) {
    const organization = await this.organization(req, organizationId);
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        address: z.string().trim().min(8).max(300),
        cuisine: z.string().min(2).max(50),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        description: z.string().min(5).max(500),
        deliveryFeeMinor: money.default(4900),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const branch = await tx.restaurant.create({
        data: {
          ...data,
          organizationId,
          slug: `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(3).toString('hex')}`,
          image: '/food/bowl.jpg',
          categories: {
            create: [
              { name: 'Signature dishes', sort: 0 },
              { name: 'Sides', sort: 1 },
              { name: 'Drinks', sort: 2 },
            ],
          },
          stations: { create: [{ name: 'Grill' }, { name: 'Drinks' }, { name: 'Dessert' }] },
          staff: { create: { userId: organization.ownerId, role: 'RESTAURANT_OWNER' } },
          tables: {
            create: Array.from({ length: 8 }, (_, i) => ({
              code: `T${String(i + 1).padStart(2, '0')}`,
              seats: i < 2 ? 2 : 4,
              posX: i % 4,
              posY: Math.floor(i / 4),
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'BRANCH_CREATED',
          entityId: branch.id,
          detail: { organizationId, name: data.name },
        },
      });
      return branch;
    });
  }
  @Get('organizations/:id/report') async groupReport(
    @Req() req: Authed,
    @Param('id') organizationId: string,
  ) {
    await this.organization(req, organizationId);
    const branches = await this.db.restaurant.findMany({
      where: { organizationId },
      include: {
        orders: {
          where: { placedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
          select: { status: true, grandMinor: true, channel: true },
        },
        inventory: true,
      },
    });
    return branches.map(({ orders, inventory, ...branch }) => {
      const completed = orders.filter((o) =>
        ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(o.status),
      );
      return {
        ...branch,
        revenueMinor: completed.reduce((s, o) => s + o.grandMinor, 0),
        orders: orders.length,
        averageTicketMinor: completed.length
          ? Math.round(completed.reduce((s, o) => s + o.grandMinor, 0) / completed.length)
          : 0,
        activeOrders: orders.filter(
          (o) => !['DELIVERED', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status),
        ).length,
        lowStock: inventory.filter((i) => i.qtyOnHand.lessThanOrEqualTo(i.lowStockQty)).length,
      };
    });
  }
  @Get('enterprise/:restaurantId/team') async team(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    return {
      members: await this.db.userRestaurantRole.findMany({
        where: { restaurantId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      invites: await this.db.staffInvite.findMany({
        where: { restaurantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true },
      }),
      schedule: await this.db.scheduledShift.findMany({
        where: { restaurantId, endsAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        include: { user: { select: { name: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      leave: await this.db.leaveRequest.findMany({
        where: { restaurantId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  @Post('enterprise/:restaurantId/invites') async invite(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        email: z.email().transform((s) => s.toLowerCase()),
        role: z.enum(['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER']),
      }),
      body,
    );
    if (data.role === 'MANAGER') await scope(this.db, req.user, restaurantId, ['RESTAURANT_OWNER']);
    const token = randomBytes(32).toString('hex'),
      tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.db.staffInvite.create({
      data: { restaurantId, ...data, tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      inviteUrl: `${process.env.APP_URL || 'http://localhost:3000'}/invite?token=${token}`,
    };
  }
  @Post('enterprise/invites/accept') async accept(@Req() req: Authed, @Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }), body);
    return this.db.atomic(async (tx) => {
      const invite = required(
        await tx.staffInvite.findUnique({
          where: { tokenHash: createHash('sha256').update(token).digest('hex') },
        }),
      );
      if (invite.email !== req.user.email.toLowerCase())
        throw new ForbiddenException('Sign in using the invitation email address.');
      if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date())
        throw new ConflictException('Invitation has expired or was already used.');
      await tx.userRestaurantRole.upsert({
        where: {
          userId_restaurantId_role: {
            userId: req.user.id,
            restaurantId: invite.restaurantId,
            role: invite.role,
          },
        },
        create: { userId: req.user.id, restaurantId: invite.restaurantId, role: invite.role },
        update: {},
      });
      if (req.user.role === 'CUSTOMER')
        await tx.user.update({ where: { id: req.user.id }, data: { role: invite.role } });
      await tx.staffInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return { restaurantId: invite.restaurantId, role: invite.role };
    });
  }
  @Patch('enterprise/invites/:id/revoke') async revoke(
    @Req() req: Authed,
    @Param('id') inviteId: string,
  ) {
    const invitation = required(await this.db.staffInvite.findUnique({ where: { id: inviteId } }));
    await scope(this.db, req.user, invitation.restaurantId, managers);
    return this.db.staffInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  }
  @Patch('enterprise/members/:id') async member(
    @Req() req: Authed,
    @Param('id') membershipId: string,
    @Body() body: unknown,
  ) {
    const member = required(
      await this.db.userRestaurantRole.findUnique({ where: { id: membershipId } }),
    );
    await scope(this.db, req.user, member.restaurantId, ['RESTAURANT_OWNER']);
    const { hourlyRateMinor } = parse(z.object({ hourlyRateMinor: money }), body);
    return this.db.userRestaurantRole.update({
      where: { id: membershipId },
      data: { hourlyRateMinor },
    });
  }
  @Post('enterprise/:restaurantId/shifts') async schedule(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        userId: id,
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        role: z.enum(['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'RESTAURANT_OWNER']),
        notes: z.string().max(500).default(''),
      }),
      body,
    );
    const start = new Date(data.startsAt),
      end = new Date(data.endsAt);
    if (
      end <= start ||
      end.getTime() - start.getTime() > 16 * 3600000 ||
      start < new Date(Date.now() - 86400000)
    )
      throw new ConflictException('Choose a valid shift of at most 16 hours.');
    const membership = required(
      await this.db.userRestaurantRole.findFirst({
        where: { restaurantId, userId: data.userId, role: data.role },
      }),
      'This teammate does not hold the selected role at this branch.',
    );
    return this.db.atomic(async (tx) => {
      if (
        await tx.scheduledShift.count({
          where: {
            userId: data.userId,
            status: 'PLANNED',
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
        })
      )
        throw new ConflictException('This teammate already has an overlapping shift.');
      return tx.scheduledShift.create({
        data: {
          ...data,
          restaurantId,
          startsAt: start,
          endsAt: end,
          hourlyRateMinor: membership.hourlyRateMinor,
        },
      });
    });
  }
  @Patch('enterprise/shifts/:id/cancel') async cancelShift(
    @Req() req: Authed,
    @Param('id') shiftId: string,
  ) {
    const shift = required(await this.db.scheduledShift.findUnique({ where: { id: shiftId } }));
    await scope(this.db, req.user, shift.restaurantId, managers);
    return this.db.scheduledShift.update({ where: { id: shiftId }, data: { status: 'CANCELLED' } });
  }
  @Get('team/my-work') async ownWork(@Req() req: Authed) {
    return {
      planned: await this.db.scheduledShift.findMany({
        where: { userId: req.user.id, status: 'PLANNED', endsAt: { gte: new Date() } },
        include: { restaurant: { select: { name: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      attendance: await this.db.shift.findMany({
        where: { userId: req.user.id },
        include: { restaurant: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
      leave: await this.db.leaveRequest.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  @Post('enterprise/:restaurantId/leave') async leave(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId);
    const data = parse(
      z.object({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        reason: z.string().min(5).max(1000),
      }),
      body,
    );
    if (new Date(data.endsAt) <= new Date(data.startsAt))
      throw new ConflictException('Leave end must follow its start.');
    return this.db.leaveRequest.create({
      data: {
        ...data,
        restaurantId,
        userId: req.user.id,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
      },
    });
  }
  @Patch('enterprise/leave/:id') async reviewLeave(
    @Req() req: Authed,
    @Param('id') leaveId: string,
    @Body() body: unknown,
  ) {
    const leave = required(await this.db.leaveRequest.findUnique({ where: { id: leaveId } }));
    await scope(this.db, req.user, leave.restaurantId, managers);
    if (leave.userId === req.user.id)
      throw new ForbiddenException('Another manager must review your request.');
    const { status } = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED']) }), body);
    return this.db.atomic(async (tx) => {
      const fresh = required(await tx.leaveRequest.findUnique({ where: { id: leaveId } }));
      if (fresh.status !== 'PENDING')
        throw new ConflictException('This request was already reviewed.');
      return tx.leaveRequest.update({
        where: { id: leaveId },
        data: { status, reviewedById: req.user.id },
      });
    });
  }
}
