import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db=new PrismaClient();
async function seed() {
  if(process.env.DEMO_SEED!=='true') throw new Error('Seed requires DEMO_SEED=true. Never seed demo accounts in production.');
  const passwordHash=await hash(process.env.DEMO_PASSWORD||'Tablelane2026!',12);
  const people=[['owner','Nadia Rahman','RESTAURANT_OWNER'],['customer','Amitav Chowdhury','CUSTOMER'],['rider','Rafi Ahmed','RIDER'],['rider2','Sadia Islam','RIDER'],['rider3','Imran Hasan','RIDER'],['admin','Platform Admin','PLATFORM_ADMIN'],['manager','Arif Hossain','MANAGER'],['kitchen','Chef Tanvir','KITCHEN'],['cashier','Maya Sultana','CASHIER'],['waiter','Fahim Khan','WAITER']];
  for(const [id,name,role] of people) await db.user.upsert({where:{id},create:{id,email:`${id}@tablelane.demo`,name,role,passwordHash},update:{}});
  for(const [i,id] of ['rider','rider2','rider3'].entries()) await db.riderProfile.upsert({where:{userId:id},create:{userId:id,status:'ONLINE',lat:23.7806+i*0.002,lng:90.4168+i*0.002,verified:true,documentRef:`DEMO-LICENSE-${i+1}`,lastPingAt:new Date(),vehicle:i===1?'Motorcycle':'Bicycle'},update:{}});
  const foods=[
    ['Smoky beef burger','Flame grilled beef, aged cheddar, house sauce & brioche.','burger',48500,'Burgers & sandwiches','Grill'],
    ['Crispy chicken burger','Buttermilk chicken, crunchy slaw & spicy mayo.','chicken',39500,'Burgers & sandwiches','Grill'],
    ['Truffle mushroom melt','Roasted mushrooms, mozzarella & truffle aioli.','burger',42500,'Burgers & sandwiches','Grill'],
    ['Grilled chicken bowl','Herb chicken, brown rice, avocado & fresh greens.','bowl',45000,'Bowls & plates','Grill'],
    ['Creamy pesto pasta','Basil pesto, parmesan & perfectly cooked penne.','pasta',52000,'Bowls & plates','Grill'],
    ['Garden harvest salad','Seasonal greens, cherry tomato & citrus dressing.','salad',32500,'Bowls & plates','Grill'],
    ['Golden fries','Crispy, sea salted potatoes with house dip.','fries',18500,'Sides & sips','Grill'],
    ['Iced matcha latte','Ceremonial matcha, milk & a little sweetness.','matcha',24500,'Sides & sips','Drinks'],
    ['Berry lemonade','Fresh berries, lemon & sparkling soda.','drink',22000,'Sides & sips','Drinks'],
    ['Chocolate brownie','Warm dark chocolate brownie with a soft centre.','brownie',26000,'Sides & sips','Dessert'],
  ];
  for(const [index,restaurantId] of ['green-fork','ember-kitchen'].entries()) {
    await db.restaurant.upsert({where:{id:restaurantId},create:{id:restaurantId,name:index?'Ember Kitchen':'The Green Fork',slug:restaurantId,cuisine:index?'Asian fusion':'Contemporary',description:index?'Bold flavours. Thoughtfully fired.':'Feel-good food, made with a little more care.',image:index?'/food/pasta.jpg':'/food/bowl.jpg',address:index?'Road 11, Banani, Dhaka':'House 24, Road 46, Gulshan 2, Dhaka',lat:23.7806+index*0.01,lng:90.4168-index*0.01},update:{}});
    for(const [id,,role] of people.filter(p=>['RESTAURANT_OWNER','MANAGER','KITCHEN','CASHIER','WAITER'].includes(p[2]))) await db.userRestaurantRole.upsert({where:{userId_restaurantId_role:{userId:id,restaurantId,role}},create:{userId:id,restaurantId,role},update:{}});
    const categories=['Burgers & sandwiches','Bowls & plates','Sides & sips'];
    for(const [sort,name] of categories.entries()) await db.menuCategory.upsert({where:{id:`${restaurantId}-cat-${sort}`},create:{id:`${restaurantId}-cat-${sort}`,restaurantId,name,sort},update:{}});
    for(const name of ['Grill','Drinks','Dessert']) await db.prepStation.upsert({where:{id:`${restaurantId}-${name}`},create:{id:`${restaurantId}-${name}`,restaurantId,name},update:{}});
    const ingredients=[['beef','Beef patty','pcs',80,15,16000],['chicken','Chicken breast','kg',28,8,36000],['buns','Brioche buns','pcs',120,25,4500],['rice','Brown rice','kg',4,8,14000],['greens','Mixed greens','kg',12,4,18000],['cheese','Cheddar cheese','pcs',90,20,2500],['milk','Fresh milk','L',22,5,10000]] as const;
    for(const [id,name,uom,qtyOnHand,lowStockQty,costMinor] of ingredients) await db.inventoryItem.upsert({where:{id:`${restaurantId}-${id}`},create:{id:`${restaurantId}-${id}`,restaurantId,name,uom,qtyOnHand,lowStockQty,costMinor},update:{}});
    for(const [i,[name,description,image,priceMinor,cat,station]] of foods.entries()) {
      const itemId=`${restaurantId}-item-${i}`;
      await db.menuItem.upsert({where:{id:itemId},create:{id:itemId,restaurantId,name:String(name),description:String(description),image:`/food/${image}.jpg`,priceMinor:Number(priceMinor),categoryId:`${restaurantId}-cat-${categories.indexOf(String(cat))}`,stationId:`${restaurantId}-${station}`,prepMinutes:station==='Drinks'?5:15},update:{}});
      const ingredient=i===0?'beef':i===1||i===3?'chicken':i===7?'milk':'greens';
      await db.recipeComponent.upsert({where:{menuItemId_inventoryItemId:{menuItemId:itemId,inventoryItemId:`${restaurantId}-${ingredient}`}},create:{menuItemId:itemId,inventoryItemId:`${restaurantId}-${ingredient}`,qty:ingredient==='beef'?1:0.15},update:{}});
      if(i<3) {
        const groupId=`${itemId}-extras`;await db.modifierGroup.upsert({where:{id:groupId},create:{id:groupId,menuItemId:itemId,name:'Make it yours',maxSelect:2},update:{}});
        for(const [suffix,label,delta] of [['cheese','Extra cheddar',4500],['sauce','House sauce',2500]] as const) await db.modifierOption.upsert({where:{id:`${groupId}-${suffix}`},create:{id:`${groupId}-${suffix}`,groupId,name:label,priceDeltaMinor:delta,...(suffix==='cheese'?{inventoryItemId:`${restaurantId}-cheese`,ingredientQty:1}:{})},update:{}});
      }
    }
    for(let i=1;i<=8;i++) await db.diningTable.upsert({where:{id:`${restaurantId}-table-${i}`},create:{id:`${restaurantId}-table-${i}`,restaurantId,code:`T${String(i).padStart(2,'0')}`,seats:i>5?6:i>2?4:2,posX:(i-1)%4,posY:Math.floor((i-1)/4)},update:{}});
    if(!await db.order.count({where:{restaurantId}})) {
      for(let day=6;day>=0;day--) for(let n=0;n<4;n++) {
        const channel=['DELIVERY','DINE_IN','TAKEAWAY'][n%3]; const status=channel==='DELIVERY'?'DELIVERED':channel==='DINE_IN'?'CLOSED':'COMPLETED';
        const placedAt=new Date(Date.now()-day*86400000-(n+1)*3600000);
        const itemId=`${restaurantId}-item-${n}`;const goods=Number(foods[n][3]);const tax=Math.round(goods*.05);const delivery=channel==='DELIVERY'?4900:0;
        const path=['PLACED','ACCEPTED','IN_KITCHEN','READY',...(channel==='DELIVERY'?['ASSIGNING_RIDER','PICKED_UP','ARRIVING','DELIVERED']:channel==='DINE_IN'?['SERVED','CLOSED']:['COMPLETED'])];
        await db.order.create({data:{restaurantId,customerId:'customer',riderId:channel==='DELIVERY'?'rider':null,channel,status,goodsMinor:goods,taxMinor:tax,deliveryFeeMinor:delivery,grandMinor:goods+tax+delivery,placedAt,idempotencyKey:`seed-${restaurantId}-${day}-${n}`,deliveryAddress:channel==='DELIVERY'?'Road 12, Gulshan 1, Dhaka':null,lines:{create:{menuItemId:itemId,nameSnapshot:String(foods[n][0]),qty:1,unitPriceMinor:goods,modifiers:[]}},history:{create:path.map((toStatus,i)=>({fromStatus:i?path[i-1]:null,toStatus,byUserId:'owner',at:new Date(placedAt.getTime()+i*180000)}))},payments:{create:{provider:'COD',status:'CAPTURED',amountMinor:goods+tax+delivery,idempotencyKey:`seed-pay-${restaurantId}-${day}-${n}`}},rating:n===0?{create:{stars:day%2?5:4,comment:'Fresh, delicious food. Arrived with care.'}}:undefined}});
      }
      await db.tableCheck.create({data:{tableId:`${restaurantId}-table-2`}});
    }
  }
  await db.promoCode.upsert({where:{code:'HELLO15'},create:{code:'HELLO15',type:'PERCENT',value:15,minOrderMinor:30000,maxDiscountMinor:15000},update:{}});
  console.log('Demo seeded: 2 restaurants, 20 menu items, 3 riders, 16 tables. Password: use DEMO_PASSWORD from your local environment.');
}
seed().finally(()=>db.$disconnect());
