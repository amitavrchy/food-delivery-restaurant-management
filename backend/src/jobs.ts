import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Db } from './db';
import { Cache } from './redis';
import { DispatchService } from './modules/dispatch';
import { transitionTx } from './modules/transitions';
@Injectable()
export class Jobs implements OnModuleInit,OnModuleDestroy {
  private queue!:Queue; private worker!:Worker;
  constructor(@Inject(Db) private db:Db,@Inject(Cache) private cache:Cache,@Inject(DispatchService) private dispatch:DispatchService) {}
  async onModuleInit() {
    this.queue=new Queue('operations',{connection:this.cache.redis});
    this.worker=new Worker('operations',async()=>this.sweep(),{connection:this.cache.redis,concurrency:1});
    this.worker.on('error',e=>console.error('Queue connection:',e.message));
    this.worker.on('failed',(_job,e)=>console.error('Operations job:',e.message));
    await this.queue.upsertJobScheduler('operations-sweep',{every:5000},{name:'sweep',opts:{removeOnComplete:20,removeOnFail:50}});
  }
  async sweep() {
    await this.db.riderOffer.updateMany({where:{status:'SENT',expiresAt:{lte:new Date()}},data:{status:'EXPIRED'}});
    await this.db.riderProfile.updateMany({where:{status:'ONLINE',lastPingAt:{lt:new Date(Date.now()-300000)}},data:{status:'OFFLINE'}});
    const pending=await this.db.order.findMany({where:{channel:'DELIVERY',status:{in:['READY','ASSIGNING_RIDER']},riderId:null},take:100});
    for(const order of pending) await this.dispatch.offer(order.id);
    const stale=await this.db.order.findMany({where:{status:'PLACED',placedAt:{lt:new Date(Date.now()-900000)}},take:100});
    for(const order of stale) await this.db.atomic(async tx=>{
      const fresh=await tx.order.findUnique({where:{id:order.id}}); if(!fresh||fresh.status!=='PLACED') return;
      await transitionTx(tx,fresh,'CANCELLED','system:timeout','Restaurant did not accept within 15 minutes.');
      await tx.payment.updateMany({where:{orderId:order.id,status:'PENDING'},data:{status:'CANCELLED'}});
    });
    await this.db.riderLocationPing.deleteMany({where:{at:{lt:new Date(Date.now()-7*86400000)}}});
    const low=await this.db.inventoryItem.findMany();
    await this.cache.redis.set('inventory:low',JSON.stringify(low.filter(i=>i.qtyOnHand.lessThanOrEqualTo(i.lowStockQty)).map(i=>i.id)),'EX',30);
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue?.close(); }
}
