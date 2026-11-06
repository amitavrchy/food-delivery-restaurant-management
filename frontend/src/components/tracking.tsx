'use client';
import { Bike, Home, MapPin, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from './provider';
import type { Order } from '@/lib/types';
export function TrackingMap({order}:{order:Order}) {
  const {socket}=useApp();const [location,setLocation]=useState<{lat:number;lng:number;at:string}|null>(null);
  useEffect(()=>{if(!socket)return;const join=()=>socket.emit('join',{room:`order:${order.id}`});const update=(data:{orderId:string;lat:number;lng:number;at:string})=>{if(data.orderId===order.id)setLocation(data);};join();socket.on('connect',join);socket.on('rider.location',update);return()=>{socket.off('connect',join);socket.off('rider.location',update);};},[socket,order.id]);
  const destination=order.dropLat&&order.dropLng?`${order.dropLat},${order.dropLng}`:order.deliveryAddress||order.restaurant.address;
  return <><div className="tracking-map" role="img" aria-label="Illustrative delivery route from restaurant to your address"><div className="map-grid"/><svg className="map-route" viewBox="0 0 500 250" fill="none" aria-hidden="true"><path d="M80 185H180V130H300V60H420" stroke="#91a477" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/><path d="M80 185H180V130H300V60H420" stroke="#fff" strokeWidth="2" strokeDasharray="6 8"/></svg><div className="map-marker restaurant"><Store size={20}/></div><div className="map-marker home"><Home size={20}/></div>{order.rider&&<div className="map-marker rider"><Bike size={21}/></div>}<span className="map-caption">Illustrative route · Not to scale</span></div>{location&&<p className="form-hint" role="status" style={{marginTop:10}}>Rider location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)} · Updated {new Date(location.at).toLocaleTimeString('en-GB',{timeZone:'Asia/Dhaka'})}</p>}<a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${order.restaurant.lat},${order.restaurant.lng};${order.dropLat||order.restaurant.lat},${order.dropLng||order.restaurant.lng}`} target="_blank" rel="noreferrer" className="text-link" style={{marginTop:14}}><MapPin size={17}/>Open live map directions</a></>;
}
