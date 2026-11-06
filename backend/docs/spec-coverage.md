# Spec coverage

| Acceptance criterion                               | Implementation                                               | Verification              |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------------------- |
| Delivery full path/history                         | Central channel-aware gate and transactional history         | API/database suite        |
| Station-relevant KDS                               | Per-station/course routing and authorized rooms              | API + browser POS/KDS     |
| Recipe depletion                                   | Decimal base/modifier BOM and deduction marker               | Stock/replay assertions   |
| Exactly one accepting rider                        | Conditional assignment, serializable transaction             | Two-rider concurrent race |
| Private throttled coordinates                      | Authenticated sockets, current customer room, Redis throttle | Room/ping checks          |
| Delivery pause preserves dine in                   | Channel-specific validation                                  | Integration suite         |
| Manager PIN for post-send void                     | Membership, PIN and reason                                   | Reject/accept cases       |
| Two restaurants/modifiers/three riders/open tables | Repeatable relational seed and kitchen history               | Seed + browser workflows  |

Additional tests cover illegal transitions, rounding, lossless split/allocation, dispatch capacity/radius, idempotency, required modifiers, role boundaries, OTP/recovery, reviews, overpayment, item/partial settlement, empty-table release, complimentary audit, editors, staff clocks and responsive typography/layout.

Core customer, restaurant, kitchen, inventory, POS, rider and platform-policy workflows are persistent. Offline cash collection works. The Leaflet map shows actual restaurant/delivery coordinates and live rider positions over OpenStreetMap tiles. Navigation opens external maps.

Advanced implemented scope: organization/branch provisioning and group reports; conflict-safe reservations, waitlists and floor editing; supplier purchasing, idempotent partial receipts, weighted costing and branch transfers; email-bound staff invitation links, wages, scheduled shifts and leave; private saved addresses/favorites, loyalty earning/redemption/restoration, scheduled checkout, scoped promotion quotas, support conversations, in-app notifications, dietary/allergen/nutrition fields, private delivery photos, suggested rider stops, POS discounts/move/merge and menu/guest/labor insights.

Stripe Checkout and partial refund adapters validate raw-body webhook signatures, amounts, currency and idempotent events. Card checkout is hidden until credentials are configured. Live provider transactions have not been verified. Generic webhook settlement cannot bypass Stripe validation.

Remaining provider/platform scope: SMS/email delivery, traffic-aware road routing, offline POS synchronization, fiscal devices, payroll/accounting connectors, SSLCommerz/bKash, multi-instance event outbox/socket fanout and public hosting. Low stock is visible in operations without outbound SMS/email. Inventory consumption remains at kitchen completion; tax/service/opening-hour policies are configurable. Penalties are recorded without external collection. Support external-refund records do not themselves transfer money.

Read README deployment boundaries before treating this as a public rollout of every advanced spec item.
