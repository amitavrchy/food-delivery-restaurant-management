'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardClock,
  Headphones,
  Megaphone,
  ShoppingBasket,
  Truck,
  Workflow,
} from 'lucide-react';
const links = [
  { href: '/restaurant/control', label: 'Command center', icon: Workflow },
  { href: '/restaurant/branches', label: 'Organizations & branches', icon: Building2 },
  { href: '/restaurant/hospitality', label: 'Reservations & waitlist', icon: CalendarDays },
  { href: '/restaurant/procurement', label: 'Purchasing & transfers', icon: ShoppingBasket },
  { href: '/restaurant/workforce', label: 'Workforce planning', icon: ClipboardClock },
  { href: '/restaurant/marketing', label: 'Promotions & retention', icon: Megaphone },
  { href: '/restaurant/insights', label: 'Business intelligence', icon: ChartNoAxesCombined },
  { href: '/restaurant/dispatch', label: 'Delivery control', icon: Truck },
  { href: '/restaurant/support', label: 'Guest support', icon: Headphones },
];
export function AdvancedNav({ role, onNavigate }: { role: string; onNavigate: () => void }) {
  const path = usePathname();
  if (!['RESTAURANT_OWNER', 'MANAGER', 'PLATFORM_ADMIN'].includes(role)) return null;
  return (
    <details className="advanced-nav" open={links.some((l) => l.href === path)}>
      <summary>
        <span className="nav-caption">ENTERPRISE TOOLS</span>
        <Workflow size={17} />
      </summary>
      <nav className="side-nav">
        {links
          .filter((l) => l.href !== '/restaurant/branches' || role !== 'MANAGER')
          .map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? 'active' : ''}
              onClick={onNavigate}
            >
              <l.icon size={19} />
              <span>{l.label}</span>
            </Link>
          ))}
      </nav>
    </details>
  );
}
