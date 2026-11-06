'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { Download, Plus, Search } from 'lucide-react';
import { useApp } from '@/components/provider';
import { ErrorState,Loading,PageHeading } from '@/components/ui';
import { OrderTable } from '@/components/order-table';
import { useResource } from '@/lib/hooks';
import { terminal } from '@/lib/api';
import { downloadCsv } from '@/lib/export';
import type { Order } from '@/lib/types';
export default function OrdersPage() {
  const {user,restaurantId}=useApp();const {data,error,loading}=useResource<Order[]>(user?`orders?restaurantId=${restaurantId}`:null);const [tab,setTab]=useState('All orders'),[query,setQuery]=useState(''),[channel,setChannel]=useState('ALL');
  useEffect(()=>{setQuery(new URLSearchParams(window.location.search).get('q')||'');},[]);
  const orders=(data||[]).filter(o=>(tab==='All orders'||tab==='New'?tab==='All orders'||o.status==='PLACED':tab==='In progress'?!terminal.includes(o.status)&&o.status!=='PLACED':tab==='Completed'?['DELIVERED','CLOSED','COMPLETED'].includes(o.status):o.status==='CANCELLED')&&(channel==='ALL'||o.channel===channel)&&(`${o.number} ${o.lines.map(l=>l.nameSnapshot).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return <><PageHeading title="Every order, a little care." description="Keep things moving from the first hello to the last bite."><button className="btn secondary" onClick={()=>downloadCsv('tablelane-orders.csv',[['Order','Placed','Channel','Status','Total (minor)'],...orders.map(o=>[o.number,o.placedAt,o.channel,o.status,o.grandMinor])])}><Download size={17}/>Export</button><Link className="btn primary" href="/restaurant/tables"><Plus size={17}/>New order</Link></PageHeading><div className="toolbar"><div className="tabs">{['All orders','New','In progress','Completed','Cancelled'].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'active':''}>{t}{t==='New'&&data?.some(o=>o.status==='PLACED')?` (${data.filter(o=>o.status==='PLACED').length})`:''}</button>)}</div><div className="mobile-stack"><div className="search-field"><Search size={17}/><input aria-label="Filter orders" placeholder="Order number or dish…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select style={{width:145}} aria-label="Filter by channel" value={channel} onChange={e=>setChannel(e.target.value)}><option value="ALL">All channels</option><option value="DELIVERY">Delivery</option><option value="DINE_IN">Dine in</option><option value="TAKEAWAY">Takeaway</option></select></div></div><section className="panel">{loading&&!data?<Loading/>:error?<ErrorState message={error}/>:<OrderTable orders={orders}/>}</section></>;
}
