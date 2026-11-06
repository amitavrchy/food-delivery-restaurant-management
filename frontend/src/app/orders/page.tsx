'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { Access, CustomerShell } from '@/components/shell';
import { Badge, Empty, ErrorState, Loading, PageHeading } from '@/components/ui';
import { useResource } from '@/lib/hooks';
import { useApp } from '@/components/provider';
import { date, label, money, terminal, time } from '@/lib/api';
import type { Order } from '@/lib/types';
export default function MyOrders() {
  const {user}=useApp();const {data,error,loading}=useResource<Order[]>(user?'orders':null);const [tab,setTab]=useState('All orders');
  const orders=(data||[]).filter(o=>tab==='All orders'||(tab==='In progress'?!terminal.includes(o.status):terminal.includes(o.status)));
  return <CustomerShell><Access><PageHeading eyebrow="FROM OUR KITCHEN TO YOUR TABLE" title="Your delicious little history." description="Every order, every update, all right here."/><div className="toolbar"><div className="tabs">{['All orders','In progress','Past orders'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div></div>{loading&&!data?<Loading/>:error?<ErrorState message={error}/>:orders.length?<div className="order-grid">{orders.map(o=><article className="panel customer-order" key={o.id}><div className="customer-order-top"><div><h3>{o.restaurant.name}</h3><span className="cell-meta">#{String(o.number).padStart(4,'0')} · {date(o.placedAt)} · {time(o.placedAt)}</span></div><Badge value={o.status}/></div><p>{o.lines.map(l=>`${l.qty}× ${l.nameSnapshot}`).join(' · ')}</p><div className="customer-order-bottom"><strong>{money(o.grandMinor)}</strong><Link className="text-link" href={`/orders/${o.id}`}>{terminal.includes(o.status)?'View order':'Track my order'}<ArrowRight size={17}/></Link></div></article>)}</div>:<Empty title="A fresh start for your next favourite"><Link className="btn primary" href="/">Find something delicious</Link></Empty>}</Access></CustomerShell>;
}
