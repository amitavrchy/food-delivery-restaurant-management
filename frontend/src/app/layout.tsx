import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import './globals.css';
export const metadata:Metadata={title:{default:'Tablelane — Good food. Great service.',template:'%s · Tablelane'},description:'Order something delicious, run a better restaurant, and deliver with care. One connected food experience.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><Provider>{children}</Provider></body></html>;}
