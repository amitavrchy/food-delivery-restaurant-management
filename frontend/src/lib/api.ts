export class ApiError extends Error { constructor(public status:number,message:string) {super(message);} }
export async function api<T>(path:string,init:RequestInit={}):Promise<T> {
  const response=await fetch(`/api/${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init.headers},cache:'no-store'});
  const data=await response.json().catch(()=>({message:'The server returned an unexpected response.'}));
  if(!response.ok) throw new ApiError(response.status,Array.isArray(data.message)?data.message.join(', '):data.message||'Something went wrong.');
  return data;
}
export const post=<T>(path:string,body:unknown={})=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const patch=<T>(path:string,body:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(body)});
export const money=(minor:number)=>new Intl.NumberFormat('en-BD',{style:'currency',currency:'BDT',maximumFractionDigits:minor%100?2:0}).format(minor/100);
export const label=(value:string)=>value.toLowerCase().replaceAll('_',' ').replace(/^\w/,c=>c.toUpperCase());
export const time=(date:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
export const date=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',day:'numeric',month:'short'}).format(new Date(value));
export const uuid=()=>crypto.randomUUID();
export const terminal=['DELIVERED','CLOSED','COMPLETED','CANCELLED'];
export const nextStatus=(o:{status:string;channel:string})=>({PLACED:'ACCEPTED',ACCEPTED:'IN_KITCHEN',READY:o.channel==='DINE_IN'?'SERVED':o.channel==='TAKEAWAY'?'COMPLETED':undefined} as Record<string,string|undefined>)[o.status];
