import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, Injectable, Param, Patch, Post, Query, Req } from '@nestjs/common';
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
export const orderInclude={restaurant:true,lines:true,history:{orderBy:{at:'asc' as const}},rider:{select:{userId:true,vehicle:true,user:{select:{name:true}}}},rating:true,payments:true};
export const checkoutSchema=z.object({restaurantId:id,channel:z.enum(['DELIVERY','TAKEAWAY','DINE_IN']),tableCheckId:id.optional(),lines:z.array(z.object({menuItemId:id,qty:z.number().int().min(1).max(30),modifierIds:z.array(id).max(20).default([]),seat:z.number().int().min(1).max(30).default(1),course:z.enum(['STARTER','MAIN','DESSERT']).default('MAIN')})).min(1).max(50),deliveryAddress:z.string().trim().min(8).max(500).optional(),dropLat:z.number().min(-90).max(90).optional(),dropLng:z.number().min(-180).max(180).optional(),promoCode:z.string().max(30).optional(),tipMinor:money.default(0),notes:z.string().max(500).default(''),paymentMethod:z.enum(['COD','COUNTER']).default('COD'),idempotencyKey:key});
@Injectable()
export class Orders {
  constructor(@Inject(Db) private db:Db,@Inject(KitchenService) private kitchen:KitchenService,@Inject(Events) private events:Events) {}
  async access(actor:Actor,orderId:string) {
    const order=required(await this.db.order.findUnique({where:{id:orderId},include:orderInclude}));
    if(order.customerId!==actor.id && order.riderId!==actor.id) await scope(this.db,actor,order.restaurantId);
    return order;
  }
  async create(actor:Actor,body:unknown) {
    const data=parse(checkoutSchema,body);
    if(data.channel==='DINE_IN') await scope(this.db,actor,data.restaurantId,['WAITER','CASHIER','MANAGER','RESTAURANT_OWNER']);
    const otp=String(randomInt(100000,1000000));
    const result=await this.db.atomic(async tx=>{
      const existing=await tx.order.findUnique({where:{idempotencyKey:data.idempotencyKey},include:orderInclude});
      if(existing) { if(existing.customerId!==actor.id) throw new ConflictException(); return existing; }
      const restaurant=required(await tx.restaurant.findUnique({where:{id:data.restaurantId}}));
      if(restaurant.status!=='ACTIVE' || (data.channel==='DELIVERY'&&!restaurant.isOnline)) throw new ConflictException('This restaurant has paused delivery orders.');
      if(data.channel==='DELIVERY'&&!data.deliveryAddress) throw new BadRequestException('A delivery address is required.');
      if(data.channel==='DINE_IN') {
        if(!data.tableCheckId) throw new BadRequestException('Select an open table check.');
        required(await tx.tableCheck.findFirst({where:{id:data.tableCheckId,status:'OPEN',table:{restaurantId:restaurant.id}}}));
      } else if(data.tableCheckId) throw new BadRequestException('Only dine in orders can have a table check.');
      const lines=[];
      const localHour=Number(new Intl.DateTimeFormat('en',{timeZone:restaurant.timezone,hour:'numeric',hourCycle:'h23'}).format(new Date()));
      for(const line of data.lines) {
        const item=required(await tx.menuItem.findFirst({where:{id:line.menuItemId,restaurantId:restaurant.id,archived:false},include:{modifierGroups:{include:{options:true}}}}));
        if(!item.isAvailable || localHour<item.availableFrom || localHour>=item.availableUntil) throw new ConflictException(`${item.name} is currently unavailable.`);
        if(new Set(line.modifierIds).size!==line.modifierIds.length) throw new BadRequestException('Duplicate modifiers.');
        const available=item.modifierGroups.flatMap(g=>g.options);
        const modifiers=line.modifierIds.map(optionId=>required(available.find(o=>o.id===optionId),'Modifier is not valid for this item.'));
        for(const group of item.modifierGroups) { const count=modifiers.filter(m=>m.groupId===group.id).length; if(count<group.minSelect||count>group.maxSelect) throw new BadRequestException(`Choose ${group.minSelect}–${group.maxSelect} options for ${group.name}.`); }
        lines.push({menuItemId:item.id,nameSnapshot:item.name,qty:line.qty,unitPriceMinor:item.priceMinor+modifiers.reduce((s,m)=>s+m.priceDeltaMinor,0),seat:line.seat,course:line.course,modifiers:modifiers.map(m=>({id:m.id,name:m.name,priceDeltaMinor:m.priceDeltaMinor,inventoryItemId:m.inventoryItemId,ingredientQty:m.ingredientQty.toString()}))});
      }
      const goods=lines.reduce((s,l)=>s+l.qty*l.unitPriceMinor,0);
      let discount=0;
      if(data.promoCode) {
        const promo=await tx.promoCode.findUnique({where:{code:data.promoCode.toUpperCase()}});
        if(!promo || !promo.active || (promo.expiresAt&&promo.expiresAt<new Date()) || goods<promo.minOrderMinor) throw new BadRequestException('Promo is invalid, expired or below its minimum order.');
        discount=Math.min(promo.maxDiscountMinor,promo.type==='PERCENT'?Math.round(goods*promo.value/100):promo.value);
      }
      const order=await tx.order.create({data:{restaurantId:restaurant.id,customerId:actor.id,channel:data.channel,tableCheckId:data.tableCheckId,deliveryAddress:data.deliveryAddress,dropLat:data.dropLat,dropLng:data.dropLng,notes:data.notes,idempotencyKey:data.idempotencyKey,otpHash:data.channel==='DELIVERY'?await hash(otp,10):null,...price(goods,data.channel,restaurant.deliveryFeeMinor,discount,data.tipMinor),lines:{create:lines as unknown as Prisma.OrderLineCreateWithoutOrderInput[]},history:{create:{toStatus:'PLACED',byUserId:actor.id}}}});
      await tx.payment.create({data:{orderId:order.id,provider:data.channel==='DINE_IN'?'COUNTER':data.paymentMethod,amountMinor:order.grandMinor,idempotencyKey:`order:${data.idempotencyKey}`}});
      if(restaurant.autoAccept || data.channel==='DINE_IN') { await transitionTx(tx,order,'ACCEPTED',actor.id); await this.kitchen.create(tx,order.id); }
      return required(await tx.order.findUnique({where:{id:order.id},include:orderInclude}));
    });
    // OTP is returned only to the placing customer, and never included in rider payloads.
    this.events.order(result,{id:result.id,status:result.status});
    return {...this.safe(result,actor),...(result.channel==='DELIVERY'&&result.placedAt.getTime()>Date.now()-5000?{deliveryOtp:otp}:{})};
  }
  safe<T extends {otpHash?:string|null;customerId:string;dropLat?:number|null;dropLng?:number|null}>(order:T,actor:Actor) { const {otpHash,...safe}=order; return safe; }
  async transition(actor:Actor,orderId:string,body:unknown) {
    const data=parse(z.object({status:z.enum(['ACCEPTED','IN_KITCHEN','READY','SERVED','CLOSED','COMPLETED','CANCELLED','PICKED_UP','ARRIVING','DELIVERED']),reason:z.string().min(3).max(300).optional(),otp:z.string().regex(/^\d{6}$/).optional(),managerPin:z.string().max(20).optional()}),body);
    const initial=await this.access(actor,orderId);
    let restaurant=false;
    if(['PICKED_UP','ARRIVING','DELIVERED'].includes(data.status)) {
      if(initial.riderId!==actor.id) throw new ForbiddenException('Only the assigned rider can update delivery.');
      if(data.status==='DELIVERED'&&(!data.otp || !initial.otpHash || !await compare(data.otp,initial.otpHash))) throw new BadRequestException('The customer delivery code is incorrect.');
    } else if(data.status==='CANCELLED'&&initial.customerId===actor.id&&actor.role==='CUSTOMER') {
      if(!['PLACED','ACCEPTED'].includes(initial.status)) throw new ConflictException('The kitchen has started. Contact the restaurant to cancel.');
    } else { await scope(this.db,actor,initial.restaurantId,['RESTAURANT_OWNER','MANAGER','CASHIER','WAITER']); restaurant=true; }
    if(data.status==='CANCELLED'&&!data.reason) throw new BadRequestException('A cancellation reason is required.');
    if(data.status==='CANCELLED'&&initial.channel==='DINE_IN'&&initial.status!=='PLACED') {
      await scope(this.db,actor,initial.restaurantId,['RESTAURANT_OWNER','MANAGER']);
      if(data.managerPin!==process.env.MANAGER_PIN) throw new ForbiddenException('Manager PIN required after send.');
    }
    await this.db.atomic(async tx=>{
      const order=required(await tx.order.findUnique({where:{id:orderId}}));
      if(['IN_KITCHEN','READY'].includes(data.status)) {
        const unfinished=await tx.kitchenTicket.count({where:{orderId,status:{notIn:['DONE','BUMPED','VOID']}}});
        if(data.status==='READY'&&unfinished) throw new ConflictException('Complete all kitchen tickets first.');
      }
      if(data.status==='CLOSED'&&order.tableCheckId) throw new ConflictException('Close this order by settling the table check.');
      await transitionTx(tx,order,data.status,actor.id,data.reason,restaurant);
      if(data.status==='ACCEPTED') await this.kitchen.create(tx,orderId);
      if(data.status==='CANCELLED') { await tx.kitchenTicket.updateMany({where:{orderId,status:{in:['QUEUED','COOKING']}},data:{status:'VOID'}}); await tx.riderOffer.updateMany({where:{orderId,status:'SENT'},data:{status:'REJECTED'}}); await tx.payment.updateMany({where:{orderId,status:'PENDING'},data:{status:'CANCELLED'}}); }
      if(['DELIVERED','COMPLETED'].includes(data.status)) await tx.payment.updateMany({where:{orderId,provider:{in:['COD','COUNTER']},status:'PENDING'},data:{status:'CAPTURED'}});
    });
    const result=await this.access(actor,orderId); this.events.order(result,{id:result.id,status:result.status}); return this.safe(result,actor);
  }
}
@Controller('orders')
export class OrdersController {
  constructor(@Inject(Db) private db:Db,@Inject(Orders) private orders:Orders) {}
  @Post() create(@Req() req:Authed,@Body() body:unknown) { return this.orders.create(req.user,body); }
  @Get() async list(@Req() req:Authed,@Query('restaurantId') restaurantId?:string) {
    if(restaurantId) await scope(this.db,req.user,restaurantId);
    const orders=await this.db.order.findMany({where:restaurantId?{restaurantId}:req.user.role==='RIDER'?{riderId:req.user.id}:{customerId:req.user.id},include:orderInclude,orderBy:{placedAt:'desc'},take:100});
    return orders.map(o=>this.orders.safe(o,req.user));
  }
  @Get(':id') async get(@Param('id') orderId:string,@Req() req:Authed) { return this.orders.safe(await this.orders.access(req.user,orderId),req.user); }
  @Patch(':id/status') transition(@Param('id') orderId:string,@Req() req:Authed,@Body() body:unknown) { return this.orders.transition(req.user,orderId,body); }
  @Post(':id/rating') async rate(@Param('id') orderId:string,@Req() req:Authed,@Body() body:unknown) {
    const order=await this.orders.access(req.user,orderId); if(order.customerId!==req.user.id || !['DELIVERED','COMPLETED','CLOSED'].includes(order.status)) throw new ForbiddenException('Rate your completed orders only.');
    const data=parse(z.object({stars:z.number().int().min(1).max(5),comment:z.string().trim().max(500)}),body);
    return this.db.rating.upsert({where:{orderId},create:{orderId,...data},update:data});
  }
}
