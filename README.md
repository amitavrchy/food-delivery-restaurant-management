# Tablelane

A connected food delivery and restaurant operations application for Dhaka, built from [Project_spec.md](Project_spec.md). **Next.js + NestJS + Prisma + PostgreSQL/PostGIS + Redis/BullMQ + Socket.IO.**

Customer ordering, kitchen service, restaurant management, table POS, rider dispatch and platform policies share one persistent backend. The responsive interface has self-hosted Plus Jakarta Sans, a **14px minimum** font size, keyboard-accessible dialogs and reduced-motion support. Money uses integer poisha; inventory uses database decimals.

## Run locally

Install **Node.js 24**, start **Docker Desktop**, then run from the repository root:

```sh
npm ci
npm run setup
npm run dev
```

Open **http://localhost:3000**. API: `http://localhost:4000/api`; readiness: `/api/health`.

Setup creates missing environment files without replacing existing ones, generates JWT/webhook secrets, starts persistent PostGIS/Redis services, applies migrations and seeds the demo. PostgreSQL uses port **5434**; Redis uses **6381**. Individual commands: `npm run infra`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`.

On Windows, stop the API before regenerating Prisma after schema changes to avoid a locked query-engine DLL.

## Demo access

The sign-in page offers Restaurant, Customer, Rider and Admin demo buttons. Default password: **`Tablelane2026!`**. A different `DEMO_PASSWORD` before first seed supports manual login; shortcuts assume the default. Development manager PIN: **4729**, configured in `backend/.env`.

| Role     | Email                   | Route                 |
| -------- | ----------------------- | --------------------- |
| Owner    | owner@tablelane.demo    | `/restaurant`         |
| Manager  | manager@tablelane.demo  | `/restaurant`         |
| Kitchen  | kitchen@tablelane.demo  | `/restaurant/kitchen` |
| Cashier  | cashier@tablelane.demo  | `/restaurant/tables`  |
| Waiter   | waiter@tablelane.demo   | `/restaurant/tables`  |
| Customer | customer@tablelane.demo | `/`                   |
| Rider    | rider@tablelane.demo    | `/rider`              |
| Admin    | admin@tablelane.demo    | `/admin`              |

Additional riders: `rider2@tablelane.demo`, `rider3@tablelane.demo`. Demo credentials are for local development only.

Seed data contains two restaurants, twenty dishes with extras, sixteen tables, three riders, historical orders/kitchen consumption and low-stock ingredients. Promo **HELLO15** gives 15% off food above ৳300, capped at ৳150. Repeat seeding preserves edited records and existing orders.

## Try a complete service

1. As a customer, customize a meal and place a delivery/takeaway cash order. Save the delivery code or regenerate it from tracking.
2. In a separate browser profile, use the owner workspace to accept the order.
3. Select its kitchen station, start cooking, mark done and bump. DONE consumes base/modifier ingredients exactly once; all tickets completed makes the order ready.
4. In another profile, go online as a rider and share location. Accept an offer, navigate to pickup, mark picked up/arriving and enter the customer’s OTP to deliver. Cash collection and earnings are recorded.
5. For dine in, open a table, add seat/course-specific rounds and send to kitchen. Complete tickets, mark orders served and settle in full, by seat, by item, equally or partially. Exact settlement closes the check. A manager can make an unpaid fully served check complimentary using a PIN and audit reason.
6. Manage menus, options, schedules, recipes and stock; record waste/restocks and attendance; pause delivery independently of dine in; explore reports and export CSV.

Offers expire after 30 seconds; dispatch expands its radius and retries after a cooldown. Riders without fresh location pings for five minutes go offline. Keep location sharing active during service.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm audit
```

With the seeded API running:

```sh
npm run test:integration
npx playwright install chromium --no-shell
npm run test:e2e
```

Playwright can start the dev servers if needed. Browser tests cover checkout, all operations pages, 14px typography/mobile overflow, rider/admin entry, table-to-kitchen-to-settlement service, editors and attendance. Screenshots: ignored `artifacts/`; HTML report: ignored `playwright-report/`. Browser tests add demo activity; API tests remove their isolated fixtures. GitHub Actions runs these checks with PostGIS/Redis services.

`npm run format` and `npm run format:check` enforce source formatting. Images/fonts are local assets, so normal page loads do not depend on CDNs.

## Structure

```text
frontend/src/app/          Customer, restaurant, rider and admin routes
frontend/src/components/   Shared UI and operational editors
frontend/src/lib/          Typed API, data hooks and exports
backend/src/domain/        Pure order, pricing and dispatch rules
backend/src/modules/       Scoped APIs and business transactions
backend/src/realtime.ts    Authorized Socket.IO rooms
backend/src/jobs.ts        Durable BullMQ operations
backend/prisma/            Schema, migrations and repeatable seed
backend/test/              Unit and database/API tests
tests/                     Browser acceptance tests
```

## Deployment boundaries

This application runs locally with persistent data. **It has not been deployed publicly.**

- Cash on delivery and counter settlement work. POS card payment records money collected on an external terminal; it does not charge a card. Live Stripe, SSLCommerz or bKash checkout requires provider adapters/credentials. The generic signed webhook is an adapter contract.
- Rider coordinates stream when browser permission is granted. Leaflet renders restaurant, delivery and rider markers over OpenStreetMap tiles. Road routing and traffic-aware ETA need a routing integration. Tile URL/attribution are configurable for production providers.
- Photo proof, SMS/email notifications, optional reservations/branch grouping, staff invitations and dispute administration are not implemented. Restaurant/team provisioning uses the seed or an operator-managed workflow. Inventory deduction timing and 5% VAT/service policies are fixed.
- Current Socket.IO rooms assume one API instance. Horizontal scaling requires a Redis socket adapter and event outbox. Configure trusted-proxy/IP limiting before public hosting.
- For production, use a fresh database without demo users, strong secrets/PINs, `DEMO_SEED=false`, actual CORS/app/socket origins, `NODE_ENV=production` and HTTPS. The API rejects default production JWT/PIN settings. Apply migrations before startup and back up PostgreSQL.

See [architecture](docs/architecture.md), [API](docs/api.md) and [spec coverage](docs/spec-coverage.md) for details and explicit limits.
