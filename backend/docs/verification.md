# Verification record

Verified locally on 6 November 2026 with Node.js 24, PostgreSQL 16/PostGIS, Redis 7 and Chromium. Frontend and backend production builds were served for the final browser acceptance run. Alternate ports 3100/4100 kept another project on 3000/4000 undisturbed.

| Check | Result |
| --- | --- |
| Independent frontend/backend typechecks and production builds | Passed |
| Unit tests including raw Stripe signature validation | 6 passed |
| PostgreSQL/Redis API integration checks, including parent suites | 20 passed |
| Browser acceptance tests | 9 passed |
| Fresh database migrations and seed | All 7 migrations and seed passed |
| Responsive restaurant and enterprise screens at 390px | Passed |
| Minimum 14px visible storefront/enterprise typography | Passed computed-style assertions |
| Dependency audit | 0 reported vulnerabilities in both apps |
| Formatting and Git whitespace | Passed |
| Root application folders | frontend and backend only, plus Git metadata |

Integration checks exercise concurrent rider acceptance, one-time base/modifier BOM consumption, authorized socket rooms, OTP delivery, private photo upload/download, service pause, manager controls, exact POS settlement, tenant boundaries, overlapping reservations and shifts, idempotent partial procurement receipts, over-delivery rejection, invitation email binding, address ownership, scheduled kitchen hold and reward restoration on cancellation. API fixtures are removed afterward. Browser checks also create demo activity in the local database.

Local screenshots and browser reports are ignored under frontend/artifacts, frontend/test-results and frontend/playwright-report. The CI example lives under backend/ci and uses independent application commands. GitHub does not discover workflows inside backend; no new automatic Actions result is claimed under the strict two-folder structure.

Stripe raw signature verification and disabled-provider behavior are tested. No real card charge/refund, SMS/email delivery or public deployment was performed. See spec-coverage.md and README for provider and scale boundaries.
