'use client';
import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardClock,
  Gift,
  Headphones,
  ShoppingBasket,
  Truck,
  Workflow,
} from 'lucide-react';
import { useApp } from '@/components/provider';
import { PageHeading, Metric } from '@/components/ui';
import { useResource } from '@/lib/hooks';
import type { Insights, Reservation, SupportCase, Procurement } from '@/lib/advanced';
import { money } from '@/lib/api';
const tools = [
  {
    href: 'branches',
    title: 'One group. Every location.',
    text: 'Provision branches and compare performance across your organization.',
    icon: Building2,
    label: 'Organizations & branches',
  },
  {
    href: 'hospitality',
    title: 'Hospitality before the first bite.',
    text: 'Reservations, capacity, waitlist and floor-plan control.',
    icon: CalendarDays,
    label: 'Reservations & floor',
  },
  {
    href: 'procurement',
    title: 'A smarter path to a stocked pantry.',
    text: 'Suppliers, purchase orders, partial receipts and branch transfers.',
    icon: ShoppingBasket,
    label: 'Purchasing & transfers',
  },
  {
    href: 'workforce',
    title: 'A stronger team, a clearer plan.',
    text: 'Private invitations, planned shifts, wages, leave and attendance.',
    icon: ClipboardClock,
    label: 'Workforce planning',
  },
  {
    href: 'marketing',
    title: 'Give your regulars another reason.',
    text: 'Scoped promotions, per-guest redemption limits and rewards.',
    icon: Gift,
    label: 'Growth & retention',
  },
  {
    href: 'insights',
    title: 'Know what is driving the business.',
    text: 'Menu engineering, guest segments, demand patterns and estimated labor.',
    icon: ChartNoAxesCombined,
    label: 'Business intelligence',
  },
  {
    href: 'dispatch',
    title: 'A clear picture of every delivery.',
    text: 'Live assignments, offer expiry, rider freshness and service delays.',
    icon: Truck,
    label: 'Delivery control',
  },
  {
    href: 'support',
    title: 'Turn a missed moment around.',
    text: 'Order-linked conversations, resolutions and audited refund records.',
    icon: Headphones,
    label: 'Guest support',
  },
];
export default function Control() {
  const { user, restaurantId } = useApp();
  const { data: insights } = useResource<Insights>(
    user ? `enterprise/${restaurantId}/insights` : null,
  );
  const { data: reservations } = useResource<Reservation[]>(
    user ? `hospitality/reservations?restaurantId=${restaurantId}` : null,
  );
  const { data: procurement } = useResource<Procurement>(
    user ? `procurement/${restaurantId}` : null,
  );
  const { data: support } = useResource<SupportCase[]>(
    user ? `support?restaurantId=${restaurantId}` : null,
  );
  return (
    <>
      <PageHeading
        eyebrow="TABLELANE OPERATING SYSTEM"
        title="More than a dashboard. A clearer way to run."
        description="A connected command center for your guests, team, inventory and delivery network."
      >
        <span className="workspace-version">
          <Workflow size={17} />
          Enterprise workspace
        </span>
      </PageHeading>
      <div className="command-banner">
        <div>
          <span className="eyebrow">EVERY PART OF SERVICE, CONNECTED</span>
          <h2>
            From your first reservation
            <br />
            to your next location.
          </h2>
          <p>
            Make decisions with real operational data. Every action stays scoped, persisted and
            accountable.
          </p>
        </div>
        <div className="command-orbit">
          <Building2 size={48} />
          <i />
          <i />
        </div>
      </div>
      <div className="metrics">
        <Metric
          label="30-day sales"
          value={money(insights?.revenueMinor || 0)}
          detail="Completed orders across this branch"
          icon={<ChartNoAxesCombined size={19} />}
        />
        <Metric
          label="Active reservations"
          value={reservations?.filter((r) => r.status === 'BOOKED').length || 0}
          detail="Tables worth planning ahead for"
          icon={<CalendarDays size={19} />}
        />
        <Metric
          label="Open purchase orders"
          value={
            procurement?.orders.filter((p) => ['DRAFT', 'ORDERED', 'PARTIAL'].includes(p.status))
              .length || 0
          }
          detail="From supplier to shelf"
          icon={<ShoppingBasket size={19} />}
        />
        <Metric
          label="Guest cases"
          value={support?.filter((c) => c.status !== 'RESOLVED').length || 0}
          detail="Open conversations needing care"
          icon={<Headphones size={19} />}
        />
      </div>
      <div className="advanced-grid">
        {tools.map((t) => (
          <Link
            className="panel feature-card feature-link"
            key={t.href}
            href={`/restaurant/${t.href}`}
          >
            <div className="summary-row">
              <span className="feature-icon">
                <t.icon size={25} />
              </span>
              <ArrowUpRight size={21} />
            </div>
            <span className="eyebrow">{t.label}</span>
            <h3>{t.title}</h3>
            <p>{t.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
