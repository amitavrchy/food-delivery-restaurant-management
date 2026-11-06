export type Address = {
  id: string;
  label: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
};
export type Loyalty = {
  points: number;
  pointValueMinor: number;
  earnRule: string;
  entries: { id: string; points: number; kind: string; reason: string; createdAt: string }[];
};
export type Reservation = {
  id: string;
  restaurantId: string;
  guestName: string;
  phone: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string;
  table: { code: string; seats: number } | null;
  restaurant: { name: string };
};
export type Waitlist = {
  id: string;
  guestName: string;
  phone: string;
  partySize: number;
  quotedMinutes: number;
  status: string;
  notes: string;
  createdAt: string;
};
export type NotificationFeed = {
  unread: number;
  items: {
    id: string;
    kind: string;
    title: string;
    body: string;
    href: string;
    readAt: string | null;
    createdAt: string;
  }[];
};
export type SupportCase = {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  refundMinor: number;
  refundReference: string | null;
  order: { id: string; number: number; grandMinor: number };
  messages: {
    id: string;
    body: string;
    createdAt: string;
    author: { name: string; role: string };
  }[];
};
export type Promotion = {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderMinor: number;
  maxDiscountMinor: number;
  maxPerCustomer: number;
  maxRedemptions: number;
  active: boolean;
  expiresAt: string | null;
  _count?: { redemptions: number };
};
export type Organization = {
  id: string;
  name: string;
  owner: { name: string; email: string };
  restaurants: {
    id: string;
    name: string;
    address: string;
    isOnline: boolean;
    _count: { orders: number; staff: number; items: number };
  }[];
};
export type GroupBranch = {
  id: string;
  name: string;
  address: string;
  revenueMinor: number;
  orders: number;
  averageTicketMinor: number;
  activeOrders: number;
  lowStock: number;
};
export type Supplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  leadDays: number;
  active: boolean;
};
export type Purchase = {
  id: string;
  status: string;
  notes: string;
  expectedAt: string | null;
  createdAt: string;
  supplier: Supplier;
  lines: {
    id: string;
    inventoryItemId: string;
    orderedQty: string;
    receivedQty: string;
    unitCostMinor: number;
    ingredient: { name: string; uom: string };
  }[];
  receipts: { id: string; invoiceReference: string; createdAt: string }[];
};
export type Procurement = {
  suppliers: Supplier[];
  orders: Purchase[];
  transfers: {
    id: string;
    qty: string;
    reason: string;
    createdAt: string;
    source: { name: string; restaurantId: string; uom: string };
    target: { name: string; restaurantId: string };
  }[];
};
export type TeamPlan = {
  members: {
    id: string;
    role: string;
    hourlyRateMinor: number;
    user: { id: string; name: string; email: string };
  }[];
  invites: { id: string; email: string; role: string; expiresAt: string }[];
  schedule: {
    id: string;
    userId: string;
    role: string;
    startsAt: string;
    endsAt: string;
    status: string;
    hourlyRateMinor: number;
    notes: string;
    user: { name: string };
  }[];
  leave: {
    id: string;
    userId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    status: string;
    user: { name: string };
  }[];
};
export type PersonalWork = {
  planned: {
    id: string;
    restaurantId: string;
    startsAt: string;
    endsAt: string;
    role: string;
    restaurant: { name: string };
  }[];
  attendance: {
    id: string;
    restaurantId: string;
    startedAt: string;
    endedAt: string | null;
    restaurant: { name: string };
  }[];
  leave: { id: string; startsAt: string; endsAt: string; reason: string; status: string }[];
};
export type Insights = {
  periodDays: number;
  revenueMinor: number;
  completedOrders: number;
  cancelledOrders: number;
  repeatGuests: number;
  guests: {
    id: string;
    name: string;
    email: string;
    visits: number;
    spendMinor: number;
    lastVisit: string;
  }[];
  hourly: { hour: number; orders: number; revenueMinor: number }[];
  menuEngineering: {
    id: string;
    name: string;
    priceMinor: number;
    costMinor: number;
    marginMinor: number;
    marginPercent: number;
    qty: number;
    revenueMinor: number;
    category: string;
  }[];
  labor: { hours: number; estimatedCostMinor: number; plannedHours: number };
  wasteCostMinor: number;
};
export type DeliveryMonitor = {
  id: string;
  number: number;
  status: string;
  placedAt: string;
  scheduledFor: string | null;
  deliveryAddress: string | null;
  grandMinor: number;
  rider: {
    userId: string;
    lat: number | null;
    lng: number | null;
    lastPingAt: string | null;
    vehicle: string;
    user: { name: string };
  } | null;
  offers: { id: string; status: string; expiresAt: string; rider: { user: { name: string } } }[];
};
export const formText = (form: FormData, key: string) => String(form.get(key) || '').trim();
export const formNumber = (form: FormData, key: string) => Number(form.get(key) || 0);
export const toIso = (local: string) => new Date(local).toISOString();
export function localDateInput(value = new Date()) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
}
