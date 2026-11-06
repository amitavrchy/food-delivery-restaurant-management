# Architecture

The browser calls same-origin `/api`, proxied by Next to Nest. Authentication uses expiring issuer-checked HS256 tokens in HttpOnly SameSite cookies and bcrypt passwords. The API derives roles from database users. Registration creates customers only. Staff APIs check restaurant membership and action-specific roles.

Socket.IO authenticates before accepting connections. Room joins separately authorize order ownership or restaurant/station access. The global guard recognizes websocket identities. Location events target the current customer’s private user room and the restaurant, preventing reassigned former riders from receiving replacement positions. Raw OTPs go only to the customer; order responses omit OTP hashes.

The UI uses the persistent API, with no local fake backend. Only cart, selected restaurant and the customer’s delivery code are stored in the browser. Socket events refresh views; 15-second polling provides fallback. Prices are recalculated and validated at checkout.

## Transactions and state

`OrderTransitionService.can` defines legal channel-specific transitions. `transitionTx` conditionally updates the current state and creates history atomically. Illegal transitions return 409. Cancellations require reasons; post-send dine-in voids require manager membership/PIN. Late restaurant cancellation stores a ৳25 penalty.

Checkout, ticket completion, dispatch acceptance and settlement use serializable PostgreSQL transactions with bounded contention retries. Database constraints enforce nonnegative stock, balanced money totals, positive quantities, one open check per table and one open shift per user.

Accepted lines become tickets grouped by station/course. Mains wait three minutes when a starter is present. DONE consumes decimal base/modifier ingredients, records stock movements and sets the deduction marker in one transaction. Replayed DONE is rejected. READY requires every non-void ticket to finish. Cooked cancelled food is not restored to inventory; unfinished cancelled tickets are voided.

## Dispatch and billing

Pure dispatch ranking filters by Haversine distance/capacity, then sorts by distance, rating, load and stable ID. Search expands up to eight times the base radius. Offers default to 30 seconds; tried riders become eligible after a two-minute cooldown. Conditional assignment of an unassigned order makes concurrent acceptance first-wins. Riders must be verified, online and below capacity. Emergency reassignment is audited and notifies customer/restaurant.

Location pings are validated, throttled in Redis and persisted; Redis receives GEO writes. Candidate ranking uses persisted coordinates with freshness checks. Browser permission provides current position. Seven-day-old raw pings are purged.

Money is integer poisha. Discounts apply before restaurant-configured VAT; dine-in adds the configured service charge and delivery adds its fee. Defaults are 5% VAT/service. Equal/weighted splits preserve every unit. Item shares proportionally include order-level charges. After a general payment, continue with remaining-balance settlement rather than allocating it to an item again. All rounds must be served; exact settlement closes checks/orders. Complimentary checks and discounts require manager authorization, PIN, reason, no prior partial payments and an audit record.

## Operations and limits

BullMQ runs a durable five-second sweep: expire offers, dispatch ready deliveries, mark stale riders offline, cancel fifteen-minute unaccepted orders, cache low-stock IDs and purge old pings. Job retention is bounded. Menus use a 60-second Redis cache invalidated on edits. Reports derive from persisted activity.

Readiness checks PostgreSQL/Redis. Redis failure makes request limiting fail closed with 503. Credential attempts retain an IP limit; other authenticated requests are limited by verified JWT subject. Public operation needs monitoring, external alerts, a trusted proxy policy and a multi-instance Socket.IO adapter/outbox before scaling. Manager PINs are deployment-wide environment configuration. Stripe is credential-gated; proof images use local private storage. Production object storage, messaging and road-routing providers are not provisioned.

Scheduled orders stay PLACED until their preparation window. The sweep does not time out future bookings prematurely. Rewards are a signed ledger with order/kind uniqueness. Serializable checkout validates promotion quotas and reward balances. PostgreSQL exclusion constraints prevent overlapping table bookings and planned staff shifts. Procurement receipts and transfers update stock, weighted cost and movement trails atomically with stable retry keys. Invitation tokens are stored as SHA-256 hashes, expire after seven days and require a matching signed-in email.

The browser map uses pinned Leaflet 1.9.4 and configurable OpenStreetMap tiles. Tile attribution stays visible; requests use normal browser caching/referrers with no bulk prefetch. Select an appropriate production tile provider under the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
