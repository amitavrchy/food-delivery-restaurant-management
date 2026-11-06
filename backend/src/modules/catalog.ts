import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed, Public } from '../auth';
import { Cache } from '../redis';
import { id, managers, money, parse, required, scope } from '../common';
import { haversine, estimateMinutes } from '../domain/dispatch';
const itemSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500),
  image: z.string().max(500),
  priceMinor: money,
  categoryId: id,
  stationId: id,
  prepMinutes: z.number().int().min(1).max(180),
  availableFrom: z.number().int().min(0).max(23).default(0),
  availableUntil: z.number().int().min(1).max(24).default(24),
});
@Controller()
export class CatalogController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Cache) private cache: Cache,
  ) {}
  @Public() @Get('restaurants') async list(
    @Query('q') q = '',
    @Query('cuisine') cuisine = '',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const restaurants = await this.db.restaurant.findMany({
      where: {
        status: 'ACTIVE',
        name: { contains: q, mode: 'insensitive' },
        ...(cuisine ? { cuisine } : {}),
      },
      include: {
        orders: {
          where: { rating: { isNot: null } },
          select: { rating: { select: { stars: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return restaurants.map(({ orders, ...r }) => {
      const origin = { lat: Number(lat || 23.7806), lng: Number(lng || 90.4168) };
      const distance = haversine(origin, r);
      return {
        ...r,
        distance: Math.round(distance * 10) / 10,
        eta: estimateMinutes(15, 0, distance),
        rating: orders.length
          ? orders.reduce((s, o) => s + (o.rating?.stars || 0), 0) / orders.length
          : null,
        reviews: orders.length,
      };
    });
  }
  @Public() @Get('restaurants/:id/menu') async menu(@Param('id') restaurantId: string) {
    return this.cache.menu(restaurantId, async () =>
      required(
        await this.db.restaurant.findFirst({
          where: { id: restaurantId, status: 'ACTIVE' },
          include: {
            categories: { orderBy: { sort: 'asc' } },
            stations: true,
            items: {
              where: { archived: false },
              include: { modifierGroups: { include: { options: true } } },
              orderBy: { name: 'asc' },
            },
          },
        }),
      ),
    );
  }
  @Patch('restaurants/:id') async settings(
    @Param('id') restaurantId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(
      z.object({
        isOnline: z.boolean().optional(),
        autoAccept: z.boolean().optional(),
        name: z.string().min(2).max(100).optional(),
        deliveryFeeMinor: money.optional(),
      }),
      body,
    );
    const result = await this.db.restaurant.update({ where: { id: restaurantId }, data });
    await this.cache.invalidate(restaurantId);
    return result;
  }
  @Post('restaurants/:id/menu') async create(
    @Param('id') restaurantId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    await scope(this.db, req.user, restaurantId, managers);
    const data = parse(itemSchema, body);
    if (data.availableFrom >= data.availableUntil)
      throw new (await import('@nestjs/common')).BadRequestException(
        'Available from must be before available until.',
      );
    await this.verifyRefs(restaurantId, data.categoryId, data.stationId);
    const result = await this.db.menuItem.create({ data: { ...data, restaurantId } });
    await this.cache.invalidate(restaurantId);
    return result;
  }
  @Patch('menu/:id') async update(
    @Param('id') itemId: string,
    @Req() req: Authed,
    @Body() body: unknown,
  ) {
    const item = required(await this.db.menuItem.findUnique({ where: { id: itemId } }));
    await scope(this.db, req.user, item.restaurantId, managers);
    const data = parse(
      itemSchema
        .partial()
        .extend({ isAvailable: z.boolean().optional(), archived: z.boolean().optional() }),
      body,
    );
    if ((data.availableFrom ?? item.availableFrom) >= (data.availableUntil ?? item.availableUntil))
      throw new (await import('@nestjs/common')).BadRequestException(
        'Available from must be before available until.',
      );
    await this.verifyRefs(
      item.restaurantId,
      data.categoryId || item.categoryId,
      data.stationId || item.stationId,
    );
    const result = await this.db.menuItem.update({ where: { id: itemId }, data });
    await this.cache.invalidate(item.restaurantId);
    return result;
  }
  private async verifyRefs(restaurantId: string, categoryId: string, stationId: string) {
    required(await this.db.menuCategory.findFirst({ where: { id: categoryId, restaurantId } }));
    required(await this.db.prepStation.findFirst({ where: { id: stationId, restaurantId } }));
  }
}
