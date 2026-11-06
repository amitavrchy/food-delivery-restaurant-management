'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bell,
  Bike,
  BookOpen,
  ChartNoAxesCombined,
  ChefHat,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useApp } from './provider';
import { Empty, Loading, Modal } from './ui';
const navigation = [
  {
    href: '/restaurant',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
  {
    href: '/restaurant/orders',
    label: 'Orders',
    icon: ClipboardList,
    roles: ['RESTAURANT_OWNER', 'MANAGER', 'CASHIER', 'WAITER'],
  },
  {
    href: '/restaurant/menu',
    label: 'Menu',
    icon: BookOpen,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
  {
    href: '/restaurant/tables',
    label: 'Tables & POS',
    icon: UtensilsCrossed,
    roles: ['RESTAURANT_OWNER', 'MANAGER', 'CASHIER', 'WAITER'],
  },
  {
    href: '/restaurant/kitchen',
    label: 'Kitchen display',
    icon: ChefHat,
    roles: ['RESTAURANT_OWNER', 'MANAGER', 'KITCHEN'],
  },
  {
    href: '/restaurant/inventory',
    label: 'Inventory',
    icon: Package,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
  {
    href: '/restaurant/staff',
    label: 'Team & shifts',
    icon: Users,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
  {
    href: '/restaurant/reports',
    label: 'Reports',
    icon: ChartNoAxesCombined,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
  {
    href: '/restaurant/settings',
    label: 'Settings',
    icon: Settings2,
    roles: ['RESTAURANT_OWNER', 'MANAGER'],
  },
];
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Tablelane home">
      <span className="brand-mark">
        <Leaf size={23} strokeWidth={2.5} />
      </span>
      tablelane<span className="brand-dot">.</span>
    </Link>
  );
}
export function Access({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, ready } = useApp();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path]);
  if (!ready || !user) return <Loading />;
  if (roles && !roles.includes(user.role) && user.role !== 'PLATFORM_ADMIN')
    return (
      <Empty title="This workspace is for your team">
        <Link className="btn primary" href="/">
          Browse restaurants
        </Link>
      </Empty>
    );
  return children;
}
export function RestaurantShell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    router = useRouter();
  const { user, restaurants, restaurantId, setRestaurantId, logout, socket } = useApp();
  const [mobile, setMobile] = useState(false),
    [help, setHelp] = useState(false),
    [notifications, setNotifications] = useState(false),
    [search, setSearch] = useState('');
  const restaurant =
    user?.memberships.find((m) => m.restaurantId === restaurantId)?.restaurant ||
    restaurants.find((r) => r.id === restaurantId);
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('join', { room: `restaurant:${restaurantId}:orders` });
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
    };
  }, [socket, restaurantId]);
  const available =
    user?.role === 'PLATFORM_ADMIN'
      ? restaurants
      : user?.memberships.map((m) => m.restaurant) || [];
  return (
    <Access roles={['RESTAURANT_OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']}>
      <div className="workspace">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
          <div className="sidebar-brand">
            <Brand />
            <button
              className="icon-btn mobile-only"
              aria-label="Close menu"
              onClick={() => setMobile(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="restaurant-picker">
            <span className="store-avatar">
              <Store size={22} />
            </span>
            <div>
              <strong>{restaurant?.name || 'Your restaurant'}</strong>
              <span>Restaurant workspace</span>
            </div>
            <ChevronDown size={16} />
            <select
              aria-label="Select restaurant"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
            >
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav className="side-nav">
            {navigation
              .filter((n) => n.roles.includes(user?.role || '') || user?.role === 'PLATFORM_ADMIN')
              .map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMobile(false)}
                  className={path === n.href ? 'active' : ''}
                >
                  <n.icon size={20} />
                  <span>{n.label}</span>
                  {path === n.href && <i />}
                </Link>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="help-card">
              <span className="help-icon">
                <CircleHelp size={21} />
              </span>
              <strong>A little help goes a long way.</strong>
              <p>Your guide to a smoother service.</p>
              <button onClick={() => setHelp(true)}>
                Open quick guide <ArrowUpRight size={16} />
              </button>
            </div>
            <Link href="/" className="store-link">
              <Store size={18} />
              View storefront
              <ArrowUpRight size={16} />
            </Link>
            <button
              className="profile"
              onClick={() => void logout().then(() => router.push('/login'))}
              title="Sign out"
            >
              <span className="avatar">
                {user?.name
                  .split(' ')
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span>
                <strong>{user?.name}</strong>
                <small>{user?.role.toLowerCase().replaceAll('_', ' ')}</small>
              </span>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="workspace-body">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-btn mobile-only"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span>Workspace</span>
              <span>/</span>
              <strong>{navigation.find((n) => n.href === path)?.label || 'Overview'}</strong>
            </div>
            <div className="topbar-actions">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(`/restaurant/orders?q=${encodeURIComponent(search)}`);
                }}
              >
                <Search size={17} />
                <input
                  placeholder="Search orders…"
                  aria-label="Search orders"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <span className="live-indicator">
                <i />
                Live workspace
              </span>
              <button
                className="icon-btn notification-btn"
                aria-label="Open activity"
                onClick={() => setNotifications(true)}
              >
                <Bell size={20} />
              </button>
              <span className="avatar small">{user?.name[0]}</span>
            </div>
          </header>
          <main id="main" className="main-content">
            {children}
          </main>
          <footer className="workspace-footer">
            <span>Thoughtfully made for better service.</span>
            <span>Tablelane · Dhaka, Bangladesh</span>
          </footer>
        </div>
        {help && (
          <Modal title="A smoother service starts here" onClose={() => setHelp(false)}>
            <div className="guide">
              <p>
                <strong>1. Receive an order.</strong> Open Orders to accept or decline with a
                reason.
              </p>
              <p>
                <strong>2. Fire the kitchen.</strong> Choose your station in Kitchen display. Start,
                finish and bump tickets. Completing tickets consumes recipe stock.
              </p>
              <p>
                <strong>3. Hand it over.</strong> Ready delivery orders are offered to nearby online
                riders. Serve dine in orders and settle their table in POS.
              </p>
              <p>
                <strong>4. Keep an eye on stock.</strong> Record restocks and waste in Inventory.
                Update recipes from the menu editor.
              </p>
              <p>
                Need to try another role? Sign out and choose a demo account on the sign in page.
              </p>
            </div>
          </Modal>
        )}
        {notifications && (
          <Modal title="Your live activity" onClose={() => setNotifications(false)}>
            <div className="guide">
              <p>Incoming orders and kitchen changes update automatically while you work.</p>
              <Link
                href="/restaurant/orders"
                className="activity-link"
                onClick={() => setNotifications(false)}
              >
                <ClipboardList />
                Review incoming orders
                <ArrowUpRight />
              </Link>
              <Link
                href="/restaurant/inventory"
                className="activity-link"
                onClick={() => setNotifications(false)}
              >
                <Package />
                Check low stock ingredients
                <ArrowUpRight />
              </Link>
            </div>
          </Modal>
        )}
      </div>
    </Access>
  );
}
export function CustomerShell({ children }: { children: ReactNode }) {
  const { user, cart, logout } = useApp();
  const path = usePathname();
  return (
    <div className="customer-app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="customer-header">
        <Brand />
        <nav>
          <Link href="/" className={path === '/' ? 'selected' : ''}>
            Discover
          </Link>
          <Link href="/orders" className={path.startsWith('/orders') ? 'selected' : ''}>
            My orders
          </Link>
          {user && user.role !== 'CUSTOMER' && (
            <Link
              href={
                user.role === 'RIDER'
                  ? '/rider'
                  : user.role === 'PLATFORM_ADMIN'
                    ? '/admin'
                    : '/restaurant'
              }
            >
              Workspace <ArrowUpRight size={16} />
            </Link>
          )}
        </nav>
        <div className="customer-actions">
          <Link className="cart-button" href="/checkout">
            <ShoppingBag size={20} />
            <span>Cart</span>
            <b>{cart.reduce((s, l) => s + l.qty, 0)}</b>
          </Link>
          {user ? (
            <button className="avatar" title="Sign out" onClick={() => void logout()}>
              {user.name[0]}
            </button>
          ) : (
            <Link href="/login" className="btn primary">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="customer-main">
        {children}
      </main>
      <footer className="customer-footer">
        <Brand />
        <span>Good food. Great service. All connected.</span>
        <span>Made for Dhaka, with care.</span>
      </footer>
    </div>
  );
}
