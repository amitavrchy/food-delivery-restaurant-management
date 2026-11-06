import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { parse } from '../common';
import { Cache } from '../redis';
@Controller('admin')
export class AdminController {
  constructor(@Inject(Db) private db:Db,@Inject(Cache) private cache:Cache) {}
  private check(req:Authed) { if(req.user.role!=='PLATFORM_ADMIN') throw new ForbiddenException(); }
  @Get() async overview(@Req() req:Authed) { this.check(req); return {restaurants:await this.db.restaurant.findMany({include:{_count:{select:{orders:true}}}}),riders:await this.db.riderProfile.findMany({include:{user:{select:{name:true,email:true}}}}),audit:await this.db.auditLog.findMany({orderBy:{createdAt:'desc'},take:50})}; }
  @Patch('restaurants/:id') async restaurant(@Param('id') restaurantId:string,@Req() req:Authed,@Body() body:unknown) {
    this.check(req); const data=parse(z.object({status:z.enum(['ACTIVE','SUSPENDED']).optional(),commissionBps:z.number().int().min(0).max(5000).optional()}),body);
    const result=await this.db.atomic(async tx=>{ const r=await tx.restaurant.update({where:{id:restaurantId},data}); await tx.auditLog.create({data:{actorId:req.user.id,action:'RESTAURANT_POLICY',entityId:restaurantId,detail:data}}); return r; }); await this.cache.invalidate(restaurantId); return result;
  }
  @Patch('riders/:id') async rider(@Param('id') userId:string,@Req() req:Authed,@Body() body:unknown) { this.check(req); const data=parse(z.object({verified:z.boolean(),documentRef:z.string().max(300).optional()}),body); return this.db.riderProfile.update({where:{userId},data}); }
}
