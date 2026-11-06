import { Body, ConflictException, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { key, money, parse, required, scope } from '../common';
import { splitBill } from '../domain/pricing';
import { transitionTx } from './transitions';
@Controller('pos')
export class PosController {
  constructor(@Inject(Db) private db:Db) {}
  @Get(':restaurantId/tables') async tables(@Param('restaurantId') restaurantId:string,@Req() req:Authed) {
    await scope(this.db,req.user,restaurantId); return this.db.diningTable.findMany({where:{restaurantId},include:{checks:{where:{status:'OPEN'},include:{orders:{include:{lines:true}},payments:true}}},orderBy:{code:'asc'}});
  }
  @Post('tables/:id/open') async open(@Param('id') tableId:string,@Req() req:Authed) {
    const table=required(await this.db.diningTable.findUnique({where:{id:tableId}})); await scope(this.db,req.user,table.restaurantId,['WAITER','CASHIER','MANAGER','RESTAURANT_OWNER']);
    return this.db.atomic(async tx=>{ const existing=await tx.tableCheck.findFirst({where:{tableId,status:'OPEN'}}); return existing||tx.tableCheck.create({data:{tableId}}); });
  }
  @Get('checks/:id/split') async split(@Param('id') checkId:string,@Req() req:Authed) {
    const check=required(await this.db.tableCheck.findUnique({where:{id:checkId},include:{table:true,orders:{where:{status:{not:'CANCELLED'}},include:{lines:true}},payments:true}})); await scope(this.db,req.user,check.table.restaurantId);
    const total=check.orders.reduce((s,o)=>s+o.grandMinor,0); const paid=check.payments.reduce((s,p)=>s+p.amountMinor,0);
    const seatGoods=new Map<number,number>(); for(const o of check.orders) for(const l of o.lines) seatGoods.set(l.seat,(seatGoods.get(l.seat)||0)+l.qty*l.unitPriceMinor);
    const seats=[...seatGoods.entries()].sort((a,b)=>a[0]-b[0]); const goods=seats.reduce((s,[,v])=>s+v,0); let allocated=0;
    const bySeat=seats.map(([seat,value],i)=>{const amount=i===seats.length-1?total-allocated:Math.floor(total*value/(goods||1));allocated+=amount;return {seat,amountMinor:amount,paidMinor:check.payments.filter(p=>p.seat===seat).reduce((s,p)=>s+p.amountMinor,0)};});
    return {totalMinor:total,paidMinor:paid,dueMinor:total-paid,equal:splitBill(total,check.table.seats),bySeat};
  }
  @Post('checks/:id/pay') async pay(@Param('id') checkId:string,@Req() req:Authed,@Body() body:unknown) {
    const initial=required(await this.db.tableCheck.findUnique({where:{id:checkId},include:{table:true}})); await scope(this.db,req.user,initial.table.restaurantId,['CASHIER','MANAGER','RESTAURANT_OWNER']);
    const data=parse(z.object({amountMinor:money.refine(v=>v>0),method:z.enum(['CASH','CARD']),seat:z.number().int().min(1).max(30).optional(),idempotencyKey:key}),body);
    return this.db.atomic(async tx=>{
      const existing=await tx.checkPayment.findUnique({where:{idempotencyKey:data.idempotencyKey}}); if(existing) { if(existing.checkId!==checkId) throw new ConflictException(); return existing; }
      const check=required(await tx.tableCheck.findUnique({where:{id:checkId},include:{orders:{where:{status:{not:'CANCELLED'}}},payments:true}}));
      if(check.status!=='OPEN') throw new ConflictException('Check is closed.');
      const due=check.orders.reduce((s,o)=>s+o.grandMinor,0)-check.payments.reduce((s,p)=>s+p.amountMinor,0);
      if(data.amountMinor>due) throw new ConflictException('Payment exceeds the remaining balance.');
      if(check.orders.some(o=>!['SERVED','CLOSED'].includes(o.status))) throw new ConflictException('Serve all orders before settling the bill.');
      const payment=await tx.checkPayment.create({data:{checkId,...data}});
      if(data.amountMinor===due) { await tx.tableCheck.update({where:{id:checkId},data:{status:'CLOSED',closedAt:new Date()}}); for(const order of check.orders) if(order.status==='SERVED') await transitionTx(tx,order,'CLOSED',req.user.id); await tx.payment.updateMany({where:{orderId:{in:check.orders.map(o=>o.id)},status:'PENDING'},data:{status:'CAPTURED'}}); }
      return payment;
    });
  }
}
