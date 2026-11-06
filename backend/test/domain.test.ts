import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderTransitionService as Machine } from '../src/domain/order-machine';
import { price,splitBill } from '../src/domain/pricing';
import { expandedRadius,haversine,rankRiders } from '../src/domain/dispatch';
test('each channel has a legal full lifecycle and rejects other channel exits',()=>{
  const paths={DELIVERY:['PLACED','ACCEPTED','IN_KITCHEN','READY','ASSIGNING_RIDER','PICKED_UP','ARRIVING','DELIVERED'],DINE_IN:['PLACED','ACCEPTED','IN_KITCHEN','READY','SERVED','CLOSED'],TAKEAWAY:['PLACED','ACCEPTED','IN_KITCHEN','READY','COMPLETED']};
  for(const [channel,path] of Object.entries(paths)) for(let i=1;i<path.length;i++) assert.equal(Machine.can(channel,path[i-1],path[i]),true,`${channel}: ${path[i-1]} -> ${path[i]}`);
  assert.equal(Machine.can('DELIVERY','READY','SERVED'),false);assert.equal(Machine.can('DINE_IN','READY','PICKED_UP'),false);assert.equal(Machine.can('TAKEAWAY','COMPLETED','CANCELLED',true),false);
});
test('cancellation respects readiness and terminal status',()=>{
  for(const channel of ['DELIVERY','DINE_IN','TAKEAWAY']) for(const status of ['DRAFT','PLACED','ACCEPTED','IN_KITCHEN']) assert.equal(Machine.can(channel,status,'CANCELLED'),true);
  assert.equal(Machine.can('DELIVERY','READY','CANCELLED'),false);assert.equal(Machine.can('DELIVERY','READY','CANCELLED',true),true);
  for(const status of ['CLOSED','DELIVERED','COMPLETED','CANCELLED']) assert.equal(Machine.can('DELIVERY',status,'ACCEPTED',true),false);
});
test('integer prices apply discount before tax and channel-specific charges',()=>{
  assert.deepEqual(price(10001,'DELIVERY',4900,1500,200),{goodsMinor:10001,discountMinor:1500,taxMinor:425,serviceMinor:0,deliveryFeeMinor:4900,tipMinor:200,grandMinor:14026});
  assert.equal(price(10000,'DINE_IN',4900).grandMinor,11000);assert.equal(price(10000,'TAKEAWAY',4900).grandMinor,10500);
  assert.equal(price(1000,'DELIVERY',4900,9999).grandMinor,4900);assert.throws(()=>price(1.5,'DELIVERY',0));assert.throws(()=>price(-1,'DINE_IN',0));
});
test('bill splits preserve every minor unit over varied totals and seat counts',()=>{
  for(let total=0;total<20000;total+=137)for(let seats=1;seats<=30;seats++) {const split=splitBill(total,seats);assert.equal(split.reduce((s,n)=>s+n,0),total);assert.ok(Math.max(...split)-Math.min(...split)<=1);}
  assert.throws(()=>splitBill(100,0));
});
test('geospatial ranking excludes capacity and distant riders with deterministic ties',()=>{
  const origin={lat:23.7806,lng:90.4168};const base={lat:23.7806,lng:90.4168,ratingAvg:4.8,capacity:2,active:0};
  const ranked=rankRiders([{...base,userId:'b'},{...base,userId:'a'},{...base,userId:'full',active:2},{...base,userId:'far',lat:24}],origin,5);
  assert.deepEqual(ranked.map(r=>r.userId),['a','b']);assert.equal(haversine(origin,origin),0);assert.ok(haversine(origin,{lat:23.8,lng:90.4})>0);
  assert.deepEqual([0,1,2,3,4].map(i=>expandedRadius(5,i)),[5,10,20,40,40]);
});
