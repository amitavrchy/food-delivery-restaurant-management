# Verification record

Verified locally on **6 November 2026** with Node.js 24, PostgreSQL 16/PostGIS, Redis 7 and Chromium. Both application production builds were served during the final browser/API checks.

| Check                                      | Result                                        |
| ------------------------------------------ | --------------------------------------------- |
| Frontend/backend TypeScript                | Passed                                        |
| Frontend/backend production builds         | Passed                                        |
| Unit tests                                 | 5 passed                                      |
| Database/API integration checks            | 11 passed, including parent suite             |
| Browser acceptance tests                   | 7 passed                                      |
| Additional mobile checkout/tracking checks | Passed                                        |
| Restaurant screens at 390px                | All passed overflow checks                    |
| Minimum 14px storefront typography         | Passed computed-style check                   |
| Leaflet/OpenStreetMap                      | Real tiles loaded; 256px tile images verified |
| Dependency audit                           | 0 reported vulnerabilities                    |
| Source format and Git whitespace checks    | Passed                                        |

Integration checks cover concurrent rider acceptance, station authorization, one-time decimal BOM consumption with extras, complete delivery history/OTP, location throttling, delivery pause with continued dine-in service, PIN-protected voids, exact item/partial settlement, complimentary audit and operational editors. Fixtures are isolated and cleaned up.

The final privacy regression additionally verifies that kitchen responses omit delivery addresses/OTP hashes and kitchen-triggered realtime order events contain only the authorized status summary. The affected POS-to-kitchen browser flow was rerun successfully.

Browser checks cover discovery, customization/promo/cash checkout, cancellation/history, restaurant screens, mobile navigation, rider/admin workspaces, table-to-kitchen-to-service-to-settlement flow, editor dialogs and staff clock actions. Sample browser activity remains in the local demo database, as described in README.

Local screenshots are in ignored `artifacts/`. GitHub Actions repeats checks in a clean Linux environment and publishes its browser report. See the repository’s Actions tab for the actual remote run result; local verification does not imply an unobserved remote result.

No live payment charge, SMS/email, photo upload or public deployment was verified. See [spec coverage](spec-coverage.md) and README deployment boundaries for remaining advanced/external integrations.
