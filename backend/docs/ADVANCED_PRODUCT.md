# Enterprise and marketplace expansion

Both restaurant operations and delivery marketplace receive equal priority. Scope is grounded in the actual feature families documented by [Toast multi-location management](https://pos.toasttab.com/products/multi-location-management), [Toast loyalty](https://support.toasttab.com/en/article/Getting-Started-Toast-Loyalty?lang=en_US) and [Uber Eats merchant ordering](https://merchants.ubereats.com/us/en/services/online-ordering/). These products do not define one finite set of "every feature in the world"; this implementation tracks concrete working modules and verification instead.

## Implementation targets

- Independent frontend/backend applications with all tooling, tests, infrastructure and documentation inside those directories.
- Organization and branch provisioning, group analytics and audited branch inventory transfers.
- Reservations with table/time conflict prevention, waitlist, capacity and floor-plan management.
- Supplier procurement, purchase approval, idempotent partial receipts and weighted inventory costing.
- Staff invitations, role-aware access, planned shifts, attendance, leave and labor analytics.
- Customer saved addresses, favorites, real loyalty ledger, earning/redemption and cancellation restoration.
- Scheduled orders with delayed kitchen activation and safe timeout handling.
- Promotion scopes, usage limits and per-customer redemption history.
- Customer/restaurant support threads, dispute workflow and audited external refund records.
- In-app notification inbox, menu allergens/dietary tags and nutrition fields.
- Manager-controlled POS discounts, table movement/merge and operational analytics.
- Private photo proof, rider route suggestions and platform delivery monitoring.

Each module must have persistent data, role checks, validated inputs, real UI actions and checks for its important failure cases. Live payment, SMS/email and production hosting must clearly distinguish configured integrations from unavailable providers.
