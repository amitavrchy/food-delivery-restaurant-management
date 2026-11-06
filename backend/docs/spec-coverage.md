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

Remaining advanced/external scope: live provider checkout/refunds, photo proof, SMS/email, traffic-aware road routing, optional reservations/branch grouping, staff invitations and dispute administration. Inventory timing/tax policies are fixed. Low stock is shown without outbound notifications. Prep reports derive from tickets. Attendance records shifts; future shift scheduling is not implemented. Penalties are recorded without external collection. Restaurant/team provisioning is operator-managed.

Read README deployment boundaries before treating this as a public rollout of every advanced spec item.
