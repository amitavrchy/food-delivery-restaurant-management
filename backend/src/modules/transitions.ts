import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderTransitionService } from '../domain/order-machine';
export async function transitionTx(tx:Prisma.TransactionClient,order:{id:string;status:string;channel:string},to:string,actorId:string,reason?:string,restaurant=false) {
  if(!OrderTransitionService.can(order.channel,order.status,to,restaurant)) throw new ConflictException(`Cannot move ${order.status} to ${to}.`);
  const changed=await tx.order.updateMany({where:{id:order.id,status:order.status},data:{status:to,...(to==='CANCELLED'?{cancelReason:reason,penaltyMinor:['READY','ASSIGNING_RIDER'].includes(order.status)?2500:0}:{})}});
  if(changed.count!==1) throw new ConflictException('Order changed. Refresh and try again.');
  await tx.orderStatusHistory.create({data:{orderId:order.id,fromStatus:order.status,toStatus:to,byUserId:actorId,reason}});
  return {...order,status:to};
}
