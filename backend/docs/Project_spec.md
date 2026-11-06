# Food Delivery + Restaurant Management System — Project Spec

> Stack: **Next.js + NestJS + Prisma + PostgreSQL/PostGIS + Redis/BullMQ + Socket.IO**  
> Combined **customer food delivery app**, **rider dispatch with live tracking**, and **full restaurant management** (menu, tables, KDS, recipes/inventory, staff shifts, dine-in POS).

---

## 1. Overview & Goals

One platform, three surfaces:
1. Customer: browse restaurants, cart, checkout, track order/rider.
2. Restaurant: menu/inventory, dine-in tables + POS, kitchen display (KDS), delivery order acceptance.
3. Rider: available orders, navigation, status updates, earnings.

### Engineering goals
- Unified **Order state machine** covering DINE_IN, TAKEAWAY, DELIVERY.
- KDS ticket routing by station; bump bar.
- Recipe-linked inventory depletion (BOM).
- Dispatch: geospatial matching, offer timeout, reassignment.
- Real-time: customer map, KDS websocket, rider location stream (throttled).

---

## 2. Roles & Permissions

| Role | Scope |
|------|-------|
| `PLATFORM_ADMIN` | Restaurants, riders, fees, disputes |
| `RESTAURANT_OWNER` | Store config, staff, menu, reports |
| `MANAGER` | Shifts, voids, discounts, inventory adjust |
| `CASHIER` | Dine-in POS, payments |
| `KITCHEN` | KDS stations only |
| `WAITER` | Table orders, run sheets |
| `RIDER` | Delivery offers & active orders |
| `CUSTOMER` | Delivery/takeaway ordering |

`UserRestaurantRole` for staff; riders are separate profile with documents.

---

## 3. Feature Modules

### Delivery / Customer
- Restaurant discovery (geo, cuisine, ETA, rating)
- Menu modifiers, cart, promo codes
- Checkout & payment
- Live tracking
- Ratings

### Restaurant management
- Multi-location optional (start single per restaurant; schema-ready for branches)
- Menu categories, items, modifiers, availability schedules
- Tables & floor plan; reservations (optional advanced)
- Dine-in POS + split bills
- KDS + prep stations
- Recipes (ingredients) + stock + wastage
- Staff shifts & attendance
- Reports: food cost %, average ticket, channel mix

### Rider
- Online/offline; capacity
- Offer accept/reject; nav deep link
- Proof of delivery (OTP/photo)
- Earnings / tips

---

## 4. Advanced Business Logic

### 4.1 Order state machine (channel-aware)
Core statuses:  
`DRAFT → PLACED → ACCEPTED → IN_KITCHEN → READY →`  
- DELIVERY: `READY → ASSIGNING_RIDER → PICKED_UP → ARRIVING → DELIVERED`  
- DINE_IN: `READY → SERVED → CLOSED`  
- TAKEAWAY: `READY → COMPLETED`  
Cancel branches from pre-READY with reason codes; after READY restaurant-only with penalty rules.

Illegal transitions throw `409`. Persist `OrderStatusHistory`.

### 4.2 Kitchen / KDS
- On ACCEPTED (or PLACED if auto-accept): explode lines → `KitchenTicket` per station (grill, drinks, dessert) based on item.stationId.
- Ticket statuses: `QUEUED → COOKING → DONE → BUMPED`.
- Course delaying: fire appetizers first; mains on delay timer.
- 86 item: mark unavailable; block cart add; notify.

### 4.3 Recipe inventory (BOM)
```
on ticket DONE or order ACCEPTED (configurable):
  for each item:
    for each RecipeComponent:
      deduct stockQty * (component.qty * line.qty) from InventoryItem at restaurant
      if below threshold → alert
```
Modifiers may map to extra components. Waste logs for spoilage.

### 4.4 Rider dispatch
```
when order READY (delivery):
  candidates = riders ONLINE within radius ordered by (distance, rating, activeOrders)
  offer to top N sequentially or parallel blast with first-accept-wins
  each Offer TTL 30s; on timeout next
  on accept: assign; lock order; start location share
  if none: expand radius / surge delivery fee / alert restaurant
```
Use Redis GEO for rider positions; persist last location periodically.

### 4.5 ETA
- Prep ETA from historical item prep times + KDS queue length.
- Delivery ETA from Haversine/OSRM stub + traffic factor.
- Show combined customer ETA; update on WS.

### 4.6 Dine-in POS specifics
- Table session (`TableCheck`) can have multiple orders/rounds.
- Split pay by item/seat; service charge; complimentary with manager PIN.
- Print to kitchen on send; void after send requires reason.

### 4.7 Edge cases
- Restaurant pause online orders (too busy) without closing dine-in.
- Rider cancel after pick up → emergency reassign; customer notify.
- Payment captured on PLACED vs on DELIVERED (config); COD for delivery.
- Modifier required groups validation.
- Concurrent first-accept-wins: unique assignment constraint on `Order.riderId` where status assigning.

---

## 5. State Machines (summary)

**Restaurant**: `PENDING → ACTIVE | SUSPENDED`  
**MenuItem**: `ACTIVE → OUT_OF_STOCK → ACTIVE | ARCHIVED`  
**Order**: see §4.1  
**KitchenTicket**: `QUEUED → COOKING → DONE → BUMPED | VOID`  
**RiderOffer**: `SENT → ACCEPTED | REJECTED | EXPIRED`  
**TableCheck**: `OPEN → CLOSED | VOID`  
**Shift**: `OPEN → CLOSED`

---

## 6. Prisma Schema Draft (core)

```prisma
model User { id String @id @default(cuid()) email String? phone String? passwordHash String? role String }
model CustomerProfile { userId String @id addresses Json }
model Restaurant {
  id String @id @default(cuid())
  name String
  slug String @unique
  status String
  lat Float
  lng Float
  timezone String @default("Asia/Dhaka")
  autoAccept Boolean @default(false)
  isOnline Boolean @default(true)
  commissionBps Int @default(1500)
}
model UserRestaurantRole {
  id String @id @default(cuid())
  userId String
  restaurantId String
  role String
  @@unique([userId, restaurantId, role])
}
model MenuCategory { id String @id @default(cuid()) restaurantId String name String sort Int }
model MenuItem {
  id String @id @default(cuid())
  restaurantId String
  categoryId String
  name String
  priceMinor Int
  stationId String?
  isAvailable Boolean @default(true)
  prepMinutes Int @default(15)
}
model ModifierGroup {
  id String @id @default(cuid())
  menuItemId String
  name String
  minSelect Int @default(0)
  maxSelect Int @default(1)
}
model ModifierOption {
  id String @id @default(cuid())
  groupId String
  name String
  priceDeltaMinor Int @default(0)
}
model RecipeComponent {
  id String @id @default(cuid())
  menuItemId String
  inventoryItemId String
  qty Decimal @db.Decimal(14,3)
}
model InventoryItem {
  id String @id @default(cuid())
  restaurantId String
  name String
  uom String
  qtyOnHand Decimal @db.Decimal(14,3)
  lowStockQty Decimal @db.Decimal(14,3)
}
model DiningTable {
  id String @id @default(cuid())
  restaurantId String
  code String
  seats Int
  posX Float?
  posY Float?
  @@unique([restaurantId, code])
}
model TableCheck {
  id String @id @default(cuid())
  tableId String
  status String
  openedAt DateTime @default(now())
  closedAt DateTime?
}
model Order {
  id String @id @default(cuid())
  restaurantId String
  customerId String?
  channel String // DINE_IN TAKEAWAY DELIVERY
  status String
  tableCheckId String?
  riderId String?
  goodsMinor Int
  deliveryFeeMinor Int @default(0)
  discountMinor Int @default(0)
  taxMinor Int @default(0)
  tipMinor Int @default(0)
  grandMinor Int
  deliveryAddress Json?
  dropLat Float?
  dropLng Float?
  placedAt DateTime?
  @@index([restaurantId, status])
  @@index([riderId, status])
}
model OrderLine {
  id String @id @default(cuid())
  orderId String
  menuItemId String
  nameSnapshot String
  qty Int
  unitPriceMinor Int
  modifiers Json
}
model OrderStatusHistory {
  id String @id @default(cuid())
  orderId String
  fromStatus String?
  toStatus String
  at DateTime @default(now())
  byUserId String?
}
model KitchenTicket {
  id String @id @default(cuid())
  orderId String
  stationId String
  status String
  items Json
  firedAt DateTime?
  doneAt DateTime?
}
model PrepStation {
  id String @id @default(cuid())
  restaurantId String
  name String
}
model RiderProfile {
  userId String @id
  status String // OFFLINE ONLINE BUSY
  lat Float?
  lng Float?
  vehicle String?
  ratingAvg Float?
}
model RiderOffer {
  id String @id @default(cuid())
  orderId String
  riderId String
  status String
  expiresAt DateTime
  @@index([orderId, status])
}
model RiderLocationPing {
  id String @id @default(cuid())
  riderId String
  lat Float
  lng Float
  at DateTime @default(now())
  @@index([riderId, at])
}
model Payment {
  id String @id @default(cuid())
  orderId String
  provider String
  status String
  amountMinor Int
  idempotencyKey String @unique
}
model Shift {
  id String @id @default(cuid())
  restaurantId String
  userId String
  startedAt DateTime @default(now())
  endedAt DateTime?
}
model PromoCode {
  id String @id @default(cuid())
  code String @unique
  type String
  value Int
  active Boolean @default(true)
}
```

Fix: `rating Avg` typo → `ratingAvg Float?` in actual schema.

---

## 7. REST API

Customer: restaurants search, menu, cart, `POST /orders`, track, rate.  
Restaurant: menu CRUD, inventory, tables, `POST /pos/checks`, KDS ticket actions, accept/reject delivery orders, shifts.  
Rider: `POST /rider/presence`, `GET /rider/offers`, accept/reject, status updates, `POST /rider/location`.  
Admin: commissions, suspensions.  
Payments webhooks.

---

## 8. Real-time Events

- `kds:{restaurantId}:{stationId}` — ticket.created/updated  
- `order:{id}` — status + rider location (customer)  
- `restaurant:{id}:orders` — new incoming  
- `rider:{id}` — offer  
Location events throttled (e.g. 3–5s) and authenticated.

---

## 9. Jobs

- Offer timeout / reassignment  
- Auto-reject unaccepted orders  
- Inventory low alerts  
- Prep time stats aggregation  
- Rider stale-online detection (no ping)  

---

## 10. Security

- Staff scoped to restaurant.  
- Customer can only see own orders; tracking token signed.  
- Rider location not exposed except to assigned order’s customer & restaurant.  
- Manager PIN for voids/comps.

---

## 11. Caching

- Menu cache per restaurant; invalidate on edit.  
- Redis GEO for riders.  
- ETA cache short TTL.

---

## 12. Testing

- State transition table tests.  
- First-accept-wins race for two riders.  
- BOM deduction quantities with modifiers.  
- Dine-in split payment totals.  
- Dispatch radius expansion logic.

---

## 13. Folder Structure

```
food-delivery-restaurant-management/
  Project_spec.md
  frontend/  # (customer) (restaurant) (kds) (rider) route groups
  backend/
    src/modules/{orders,kds,dispatch,inventory,pos,menu,riders,payments,...}
```

---

## 14. Env vars

`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `APP_URL`, `CORS_ORIGINS`, `S3_*`, `SMTP_URL`, `SMS_*`, `STRIPE_*`, `SSLCOMMERZ_*`, `BKASH_*`, `DISPATCH_RADIUS_KM`, `RIDER_OFFER_TTL_SECONDS`, `LOCATION_PING_MIN_INTERVAL_MS`, `MAP_ROUTING_URL`, `DEFAULT_COMMISSION_BPS`

---

## 15. Milestones

1. Auth + restaurant + menu  
2. Delivery order + payments + basic statuses  
3. KDS + stations  
4. Inventory BOM  
5. Dine-in tables + POS  
6. Rider dispatch + live map  
7. Promos, reports, harden  

---

## 16. Acceptance Criteria

- [ ] Delivery order walks full status path with history rows.  
- [ ] KDS shows tickets only for relevant station.  
- [ ] Completing kitchen tickets deducts recipe ingredients.  
- [ ] Two riders accepting same offer → exactly one assigned.  
- [ ] Customer receives throttled location updates only for their active order.  
- [ ] Restaurant can pause delivery while dine-in continues.  
- [ ] POS void after send requires manager role/PIN.  
- [ ] Seed demo: 2 restaurants, menu with modifiers, 3 riders, open tables.

---

## 17. Agent Notes

- Implement `OrderTransitionService.can/transition` as single gate.  
- `DispatchService` pure ranking function + side-effectful offer sender.  
- Use ints for money; Decimal for inventory qty.  
- Socket rooms must authorize on join.
