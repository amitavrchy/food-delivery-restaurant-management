import { Body, ConflictException, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from '../db';
import { Authed } from '../auth';
import { id, managers, parse, required, scope } from '../common';
@Controller('inventory')
export class InventoryController {
  constructor(@Inject(Db) private db:Db) {}
  @Get(':restaurantId') async list(@Param('restaurantId') restaurantId:string,@Req() req:Authed) { await scope(this.db,req.user,restaurantId); return this.db.inventoryItem.findMany({where:{restaurantId},include:{movements:{orderBy:{createdAt:'desc'},take:8}},orderBy:{name:'asc'}}); }
  @Post(':id/adjust') async adjust(@Param('id') inventoryItemId:string,@Req() req:Authed,@Body() body:unknown) {
    const item=required(await this.db.inventoryItem.findUnique({where:{id:inventoryItemId}})); await scope(this.db,req.user,item.restaurantId,managers);
    const data=parse(z.object({delta:z.number().min(-100000).max(100000).refine(v=>v!==0),reason:z.enum(['RESTOCK','WASTE','CORRECTION']),notes:z.string().min(3).max(300)}),body);
    if((data.reason==='WASTE'&&data.delta>0)||(data.reason==='RESTOCK'&&data.delta<0)) throw new ConflictException('Restocks add stock; waste removes stock.');
    return this.db.atomic(async tx=>{
      const current=required(await tx.inventoryItem.findUnique({where:{id:inventoryItemId}})); if(current.qtyOnHand.add(data.delta).lessThan(0)) throw new ConflictException('Stock cannot go below zero.');
      await tx.stockMovement.create({data:{inventoryItemId,delta:new Prisma.Decimal(data.delta),reason:data.reason,reference:data.notes,byUserId:req.user.id}});
      return tx.inventoryItem.update({where:{id:inventoryItemId},data:{qtyOnHand:{increment:data.delta}}});
    });
  }
  @Get('recipe/:itemId') async recipe(@Param('itemId') itemId:string,@Req() req:Authed) { const item=required(await this.db.menuItem.findUnique({where:{id:itemId}})); await scope(this.db,req.user,item.restaurantId); return this.db.recipeComponent.findMany({where:{menuItemId:itemId},include:{ingredient:true}}); }
  @Put('recipe/:itemId') async saveRecipe(@Param('itemId') menuItemId:string,@Req() req:Authed,@Body() body:unknown) {
    const item=required(await this.db.menuItem.findUnique({where:{id:menuItemId}})); await scope(this.db,req.user,item.restaurantId,managers);
    const {components}=parse(z.object({components:z.array(z.object({inventoryItemId:id,qty:z.number().positive().max(10000)})).max(50)}),body);
    if(new Set(components.map(c=>c.inventoryItemId)).size!==components.length) throw new ConflictException('Duplicate recipe ingredients.');
    for(const c of components) required(await this.db.inventoryItem.findFirst({where:{id:c.inventoryItemId,restaurantId:item.restaurantId}}));
    return this.db.atomic(async tx=>{ await tx.recipeComponent.deleteMany({where:{menuItemId}}); return tx.recipeComponent.createMany({data:components.map(c=>({...c,menuItemId}))}); });
  }
}
