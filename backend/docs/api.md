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

The generic webhook expects `paymentId`, `providerReference`, `amountMinor`, and `status`. Sign `JSON.stringify(payload)` with HMAC-SHA256 and `PAYMENT_WEBHOOK_SECRET`; send its hex digest as `x-payment-signature`. PENDING → CAPTURED/FAILED and CAPTURED → REFUNDED are allowed; identical replays are harmless. COD/COUNTER are excluded. A real provider requires its own checkout/signature adapter.
