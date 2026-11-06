import { Inject } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Db } from './db';
import { scope } from './common';
import { tokenActor } from './auth';
@WebSocketGateway({cors:{origin:(process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),credentials:true}})
export class Events implements OnGatewayConnection {
  @WebSocketServer() server!:Server;
  constructor(@Inject(Db) private db:Db) {}
  async handleConnection(socket:Socket) {
    try {
      const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').filter(Boolean).map(s=>s.trim().split('=')));
      const {sub} = tokenActor(cookies.session || socket.handshake.auth.token || '');
      const user = await this.db.user.findUnique({where:{id:sub}}); if(!user) throw new Error();
      socket.data.user = user;
      await socket.join(`user:${user.id}`);
    } catch { socket.disconnect(true); }
  }
  @SubscribeMessage('join') async join(@ConnectedSocket() socket:Socket,@MessageBody() data:{room:string}) {
    try {
      const actor = socket.data.user; if(!actor || typeof data?.room!=='string') throw new Error();
      const [kind,id,station] = data.room.split(':');
      if (kind==='order') {
        const order = await this.db.order.findUnique({where:{id}}); if(!order) throw new Error();
        if(order.customerId!==actor.id && order.riderId!==actor.id) await scope(this.db,actor,order.restaurantId);
      } else if(kind==='restaurant' || kind==='kds') {
        await scope(this.db,actor,id,kind==='kds'?['KITCHEN','MANAGER','RESTAURANT_OWNER']:undefined);
        if(kind==='kds' && !await this.db.prepStation.findFirst({where:{id:station,restaurantId:id}})) throw new Error();
      } else throw new Error();
      await socket.join(data.room); return {ok:true};
    } catch { return {ok:false,error:'Room access denied'}; }
  }
  emit(room:string,event:string,data:unknown) { this.server?.to(room).emit(event,data); }
  order(order:{id:string;restaurantId:string;customerId:string;riderId:string|null},data:unknown) {
    this.emit(`order:${order.id}`,'order.updated',data);
    this.emit(`restaurant:${order.restaurantId}:orders`,'order.updated',data);
    this.emit(`user:${order.customerId}`,'order.updated',data);
    if(order.riderId) this.emit(`user:${order.riderId}`,'order.updated',data);
  }
}
