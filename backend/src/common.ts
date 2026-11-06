import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Db } from './db';
export type Actor = { id: string; role: string; name: string; email: string };
export const staffRoles = ['RESTAURANT_OWNER','MANAGER','CASHIER','KITCHEN','WAITER'];
export const managers = ['RESTAURANT_OWNER','MANAGER'];
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export async function scope(db: Db, actor: Actor, restaurantId: string, roles = staffRoles) {
  if (actor.role === 'PLATFORM_ADMIN') return;
  const membership = await db.userRestaurantRole.findFirst({where:{userId:actor.id,restaurantId,role:{in:roles}}});
  if (!membership) throw new ForbiddenException('You do not have access to this restaurant.');
}
export function required<T>(value: T | null | undefined, message = 'Record not found'): T {
  if (value == null) throw new NotFoundException(message); return value;
}
export const id = z.string().min(1).max(100);
export const money = z.number().int().min(0).max(100000000);
export const key = z.string().min(8).max(150);
export const coordinates = {lat:z.number().min(-90).max(90), lng:z.number().min(-180).max(180)};
