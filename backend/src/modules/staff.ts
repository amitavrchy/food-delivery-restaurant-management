import { ConflictException, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Db } from '../db';
import { Authed } from '../auth';
import { required, scope } from '../common';
@Controller('staff')
export class StaffController {
  constructor(@Inject(Db) private db: Db) {}
  @Get(':restaurantId') async list(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Authed,
  ) {
    await scope(this.db, req.user, restaurantId, ['RESTAURANT_OWNER', 'MANAGER']);
    return this.db.userRestaurantRole.findMany({
      where: { restaurantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            shifts: { where: { restaurantId }, orderBy: { startedAt: 'desc' }, take: 20 },
          },
        },
      },
    });
  }
  @Post(':restaurantId/clock-in') async clockIn(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Authed,
  ) {
    await scope(this.db, req.user, restaurantId);
    return this.db.atomic(async (tx) => {
      if (await tx.shift.count({ where: { userId: req.user.id, endedAt: null } }))
        throw new ConflictException('You already have an open shift.');
      return tx.shift.create({ data: { restaurantId, userId: req.user.id } });
    });
  }
  @Post(':restaurantId/clock-out') async clockOut(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Authed,
  ) {
    await scope(this.db, req.user, restaurantId);
    const shift = required(
      await this.db.shift.findFirst({
        where: { restaurantId, userId: req.user.id, endedAt: null },
      }),
      'No open shift.',
    );
    return this.db.shift.update({ where: { id: shift.id }, data: { endedAt: new Date() } });
  }
}
