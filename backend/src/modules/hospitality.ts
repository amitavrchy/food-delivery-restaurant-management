import {
  Body,
  ConflictException,
  Controller,
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
import { Authed } from '../auth';
import { id, parse, required, scope } from '../common';
const serviceRoles = ['RESTAURANT_OWNER', 'MANAGER', 'WAITER', 'CASHIER'];
@Controller('hospitality')
export class HospitalityController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('reservations') async list(
    @Req() req: Authed,
    @Query('restaurantId') restaurantId?: string,
  ) {
    if (restaurantId) await scope(this.db, req.user, restaurantId, serviceRoles);
    return this.db.reservation.findMany({
      where: restaurantId ? { restaurantId } : { userId: req.user.id },
      include: {
        table: { select: { code: true, seats: true } },
        restaurant: { select: { name: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
  }
  @Post('reservations') async book(@Req() req: Authed, @Body() body: unknown) {
    const data = parse(
      z.object({
        restaurantId: id,
        tableId: id.optional(),
        guestName: z.string().trim().min(2).max(100),
        phone: z.string().min(7).max(25),
        partySize: z.number().int().min(1).max(30),
        startsAt: z.iso.datetime({ offset: true }),
        durationMinutes: z.number().int().min(30).max(180).default(90),
        notes: z.string().max(500).default(''),
      }),
      body,
    );
    const startsAt = new Date(data.startsAt),
      endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60000);
    if (startsAt < new Date(Date.now() - 300000) || startsAt > new Date(Date.now() + 90 * 86400000))
      throw new ConflictException('Choose a time within the next 90 days.');
    if (data.tableId) await scope(this.db, req.user, data.restaurantId, serviceRoles);
    return this.db.atomic(async (tx) => {
      required(
        await tx.restaurant.findFirst({ where: { id: data.restaurantId, status: 'ACTIVE' } }),
      );
      const tables = await tx.diningTable.findMany({
        where: {
          restaurantId: data.restaurantId,
          seats: { gte: data.partySize },
          ...(data.tableId ? { id: data.tableId } : {}),
        },
        orderBy: [{ seats: 'asc' }, { code: 'asc' }],
      });
      let selected: string | undefined;
      for (const table of tables) {
        if (
          !(await tx.reservation.count({
            where: {
              tableId: table.id,
              status: { in: ['BOOKED', 'SEATED'] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          }))
        ) {
          selected = table.id;
          break;
        }
      }
      if (!selected)
        throw new ConflictException(
          'No suitable table is available for this time. Try another time or party size.',
        );
      const reservation = await tx.reservation.create({
        data: {
          restaurantId: data.restaurantId,
          userId: req.user.id,
          tableId: selected,
          guestName: data.guestName,
          phone: data.phone,
          partySize: data.partySize,
          startsAt,
          endsAt,
          notes: data.notes,
        },
      });
      await tx.notification.create({
        data: {
          userId: req.user.id,
          kind: 'RESERVATION',
          title: 'Your table is reserved',
          body: `${data.partySize} guests · ${startsAt.toISOString()}`,
          href: '/account?tab=reservations',
        },
      });
      return reservation;
    });
  }
  @Patch('reservations/:id') async reservationStatus(
    @Req() req: Authed,
    @Param('id') reservationId: string,
    @Body() body: unknown,
  ) {
    const data = parse(
      z.object({ status: z.enum(['CANCELLED', 'SEATED', 'COMPLETED', 'NO_SHOW']) }),
      body,
    );
    const original = required(
      await this.db.reservation.findUnique({ where: { id: reservationId } }),
    );
    if (!(data.status === 'CANCELLED' && original.userId === req.user.id))
      await scope(this.db, req.user, original.restaurantId, serviceRoles);
    return this.db.atomic(async (tx) => {
      const reservation = required(
        await tx.reservation.findUnique({ where: { id: reservationId } }),
      );
      const transitions: Record<string, string[]> = {
        BOOKED: ['CANCELLED', 'SEATED', 'NO_SHOW'],
        SEATED: ['COMPLETED'],
      };
      if (!transitions[reservation.status]?.includes(data.status))
        throw new ConflictException('This reservation cannot move to that state.');
      if (data.status === 'SEATED') {
        if (!reservation.tableId) throw new ConflictException('A table is required.');
        if (reservation.startsAt.getTime() > Date.now() + 30 * 60000)
          throw new ConflictException(
            'Guests may be seated up to 30 minutes before their booking.',
          );
        if (await tx.tableCheck.count({ where: { tableId: reservation.tableId, status: 'OPEN' } }))
          throw new ConflictException('The table still has an open check.');
        await tx.tableCheck.create({ data: { tableId: reservation.tableId } });
      }
      if (
        data.status === 'COMPLETED' &&
        reservation.tableId &&
        (await tx.tableCheck.count({ where: { tableId: reservation.tableId, status: 'OPEN' } }))
      )
        throw new ConflictException(
          'Settle or release the table before completing its reservation.',
        );
      return tx.reservation.update({ where: { id: reservationId }, data: { status: data.status } });
    });
  }
  @Get(':restaurantId/waitlist') async waitlist(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
  ) {
    await scope(this.db, req.user, restaurantId, serviceRoles);
    return this.db.waitlistEntry.findMany({
      where: { restaurantId, status: { in: ['WAITING', 'CONTACTED'] } },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post(':restaurantId/waitlist') async join(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, serviceRoles);
    const data = parse(
      z.object({
        guestName: z.string().min(2).max(100),
        phone: z.string().min(7).max(25),
        partySize: z.number().int().min(1).max(30),
        quotedMinutes: z.number().int().min(1).max(240),
        notes: z.string().max(500).default(''),
      }),
      body,
    );
    return this.db.waitlistEntry.create({ data: { restaurantId, ...data } });
  }
  @Patch('waitlist/:id') async updateWaitlist(
    @Req() req: Authed,
    @Param('id') entryId: string,
    @Body() body: unknown,
  ) {
    const entry = required(await this.db.waitlistEntry.findUnique({ where: { id: entryId } }));
    await scope(this.db, req.user, entry.restaurantId, serviceRoles);
    const { status } = parse(
      z.object({ status: z.enum(['CONTACTED', 'SEATED', 'CANCELLED']) }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const current = required(await tx.waitlistEntry.findUnique({ where: { id: entryId } }));
      if (!['WAITING', 'CONTACTED'].includes(current.status))
        throw new ConflictException('This guest has already left the waitlist.');
      return tx.waitlistEntry.update({ where: { id: entryId }, data: { status } });
    });
  }
  @Post(':restaurantId/tables') async createTable(
    @Req() req: Authed,
    @Param('restaurantId') restaurantId: string,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, ['RESTAURANT_OWNER', 'MANAGER']);
    const data = parse(
      z.object({
        code: z.string().trim().min(1).max(20),
        seats: z.number().int().min(1).max(30),
        posX: z.number().min(0).max(20).default(0),
        posY: z.number().min(0).max(20).default(0),
      }),
      body,
    );
    return this.db.diningTable.create({ data: { restaurantId, ...data } });
  }
  @Patch('tables/:id') async editTable(
    @Req() req: Authed,
    @Param('id') tableId: string,
    @Body() body: unknown,
  ) {
    const table = required(await this.db.diningTable.findUnique({ where: { id: tableId } }));
    await scope(this.db, req.user, table.restaurantId, ['RESTAURANT_OWNER', 'MANAGER']);
    const data = parse(
      z.object({
        code: z.string().trim().min(1).max(20).optional(),
        seats: z.number().int().min(1).max(30).optional(),
        posX: z.number().min(0).max(20).optional(),
        posY: z.number().min(0).max(20).optional(),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      if (data.seats && (await tx.tableCheck.count({ where: { tableId, status: 'OPEN' } })))
        throw new ConflictException('Settle the current check before changing capacity.');
      return tx.diningTable.update({ where: { id: tableId }, data });
    });
  }
}
