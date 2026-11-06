# API guide

Base: `http://localhost:4000/api` (frontend proxy: `/api`). JSON inputs are schema-validated. Browser auth uses `session`; bearer JWTs are also accepted for HTTP clients. POST normally returns 201; GET/PATCH/PUT return 200. Errors have readable `message` fields and 400/401/403/404/409/429 statuses.

| Area       | Routes                                                                                                                        | Access                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Identity   | `POST auth/register`, `POST auth/login`, `POST auth/logout`, `GET auth/me`                                                    | Public register/login; authenticated identity/logout |
| Discovery  | `GET restaurants?q=&cuisine=&lat=&lng=`, `GET restaurants/:id/menu`                                                           | Public active restaurants                            |
| Store/menu | `PATCH restaurants/:id`, `POST restaurants/:id/menu`, `PATCH menu/:id`, `PUT menu/:id/modifiers`                              | Scoped owner/manager                                 |
| Orders     | `POST orders`, `GET orders`, `GET orders/:id`, `GET orders?restaurantId=:id`                                                  | Order ownership/assignment; scoped staff queue       |
| Actions    | `PATCH orders/:id/status`, `POST orders/:id/rating`, `POST orders/:id/delivery-code`, `GET orders/:id/tracking`               | Action-specific role; own customer ratings/code      |
| Kitchen    | `GET kds/:restaurantId?station=:id`, `PATCH kds/:ticketId`                                                                    | Scoped owner/manager/kitchen                         |
| Inventory  | `GET inventory/:restaurantId`, `POST inventory/restaurant/:id`, `PATCH inventory/:id`, `POST inventory/:id/adjust`            | Scoped read; manager write                           |
| Recipes    | `GET inventory/recipe/:itemId`, `PUT inventory/recipe/:itemId`                                                                | Scoped read; manager write                           |
| Floor      | `GET pos/:restaurantId/tables`, `POST pos/tables/:id/open`                                                                    | Scoped staff/service role                            |
| Billing    | `GET pos/checks/:id/split`, `POST pos/checks/:id/pay`, `POST pos/checks/:id/close-empty`, `POST pos/checks/:id/complimentary` | Scoped staff; cashier pay; manager + PIN comp        |
| Team       | `GET staff/:restaurantId`, `POST staff/:restaurantId/clock-in`, `POST staff/:restaurantId/clock-out`                          | Manager roster; staff clocks self                    |
| Reports    | `GET reports/:restaurantId?days=7`                                                                                            | Owner/manager; 1–90 days                             |
| Rider      | `GET rider/profile`, `POST rider/presence`, `GET rider/offers`, `POST rider/location`                                         | Profile owner                                        |
| Dispatch   | `POST rider/offers/:id/accept`, `POST rider/offers/:id/reject`, `POST rider/orders/:id/emergency`                             | Offer/assigned rider                                 |
| Platform   | `GET admin`, `PATCH admin/restaurants/:id`, `PATCH admin/riders/:id`                                                          | Platform admin                                       |
| Adapter    | `POST payments/webhook`                                                                                                       | HMAC signature/amount/state validation               |
| Readiness  | `GET health`                                                                                                                  | Public dependency status                             |

Checkout requires `restaurantId`, `channel`, nonempty `lines` and a new `idempotencyKey`. A line contains `menuItemId`, integer `qty`, `modifierIds`, optional `seat`/`course`. Delivery requires `deliveryAddress`; dine-in requires `tableCheckId` and staff scope. The server calculates every total. Repeat the same key to retry an uncertain request.

Status example: `{ "status": "ACCEPTED" }`. Cancellation needs `reason`; post-send dine-in void also needs `managerPin`. Delivery requires the assigned rider and `{ "status": "DELIVERED", "otp": "123456" }`.

Stock: `{ "delta": 5, "reason": "RESTOCK", "notes": "Supplier delivery 42" }`; WASTE uses a negative delta. Recipe PUT replaces `{ "components": [{ "inventoryItemId": "...", "qty": 1 }] }` atomically. POS payments use `amountMinor`, `method`, `idempotencyKey` and optional `seat` or `lineId` from the split response.

Connect Socket.IO to the API origin with credentials. Emit `join` with `order:ORDER_ID`, `restaurant:RESTAURANT_ID:orders` or `kds:RESTAURANT_ID:STATION_ID`; acknowledgement indicates access. Private user rooms are server-selected. Events: `order.updated`, `ticket.updated`, `rider.offer`, `rider.location`, `dispatch.alert`.

The generic webhook expects `paymentId`, `providerReference`, `amountMinor`, and `status`. Sign `JSON.stringify(payload)` with HMAC-SHA256 and `PAYMENT_WEBHOOK_SECRET`; send its hex digest as `x-payment-signature`. PENDING → CAPTURED/FAILED and CAPTURED → REFUNDED are allowed; identical replays are harmless. COD/COUNTER/STRIPE are excluded. Stripe uses its dedicated raw-body signature adapter.

## Enterprise and marketplace routes

| Area | Routes | Access |
| --- | --- | --- |
| Customer | `GET/POST account/addresses`, `DELETE account/addresses/:id`, `PATCH account/addresses/:id/default`, `GET account/loyalty`, `GET account/favorites`, `POST/DELETE account/favorites/:restaurantId` | Current user only |
| Inbox | `GET notifications`, `PATCH notifications/:id/read`, `POST notifications/read-all` | Current user only |
| Promotions | `GET promotions?restaurantId=`, `GET/POST marketing/:restaurantId`, `PATCH marketing/promotions/:id` | Public eligible offers; scoped manager write |
| Support | `GET/POST support`, `POST support/:id/messages`, `PATCH support/:id` | Own customer threads or scoped managers |
| Hospitality | `GET/POST hospitality/reservations`, `PATCH hospitality/reservations/:id`, `GET/POST hospitality/:restaurantId/waitlist`, `PATCH hospitality/waitlist/:id`, `POST hospitality/:restaurantId/tables`, `PATCH hospitality/tables/:id` | Own bookings; scoped service/manager actions |
| Organizations | `GET/POST organizations`, `POST organizations/:id/branches`, `GET organizations/:id/report` | Organization owner or platform admin |
| Procurement | `GET procurement/:restaurantId`, `POST procurement/:restaurantId/suppliers`, `POST procurement/:restaurantId/orders`, `PATCH procurement/orders/:id`, `POST procurement/orders/:id/receive`, `POST procurement/transfers` | Scoped managers; both branches required for transfers |
| Workforce | `GET enterprise/:restaurantId/team`, `POST enterprise/:restaurantId/invites`, `POST enterprise/invites/accept`, `PATCH enterprise/invites/:id/revoke`, `PATCH enterprise/members/:id`, `POST enterprise/:restaurantId/shifts`, `PATCH enterprise/shifts/:id/cancel`, `GET team/my-work`, `POST enterprise/:restaurantId/leave`, `PATCH enterprise/leave/:id` | Scoped planning; own invitation/leave/self service |
| Insight/control | `GET enterprise/:restaurantId/insights`, `GET enterprise/:restaurantId/dispatch` | Scoped managers |
| Advanced POS | `POST pos/checks/:id/discount`, `POST pos/checks/:id/move`, `POST pos/checks/:id/merge` | Scoped staff; manager/PIN for discount |
| Rider evidence | `GET rider/route`, `POST rider/orders/:id/proof` (multipart `photo`), `GET delivery-proofs/:id` | Assigned rider; download also customer/scoped manager |
| Stripe | `GET payments/stripe/config`, `POST payments/stripe/session`, `POST payments/stripe/webhook`, `POST payments/stripe/refund` | Own pending checkout, signed provider event, manager/PIN refund |

Scheduled checkout accepts `scheduledFor` (30 minutes to seven days), `redeemPoints` and optional `deliveryPhone`. Restaurant settings accept basis-point tax/service rates, minimum food subtotal, delivery radius, loyalty and complete weekday opening windows. Receipt/refund/transfer callers must retain their idempotency key when retrying an uncertain result. Support refund records require an external reference and do not transfer funds.
