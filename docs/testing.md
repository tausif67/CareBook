# QA and test strategy

## Automated layers

- Unit: fee/commission/coupon integer arithmetic, public appointment ID and webhook HMAC.
- Unit: private-document DTO boundaries and encrypted object metadata verification.
- API integration: OTP exchange, dependency readiness and unsigned webhook rejection against migrated PostgreSQL and live Redis.
- Database concurrency: two real HTTP booking requests race for the final doctor slot; exactly one succeeds and the other receives 409.
- Payment integration: a signed capture updates payment/appointment ledgers once; replaying the same provider event is a no-op.
- Contract: snapshot generated OpenAPI and validate mobile/admin clients against it.
- UI: Flutter widget tests for empty/loading/error states; React component tests for role-gated actions.
- End-to-end: Firebase test phone → approved doctor → slot → Razorpay test checkout/webhook → confirmed history → reminders → completion → review.

## Critical release scenarios

| Scenario | Expected invariant |
| --- | --- |
| Two patients choose final capacity simultaneously | At most capacity succeeds; loser receives 409 |
| Same booking request is retried | Same appointment is returned; no new charge |
| Gateway order creation times out | Retrying returns/creates one valid order for the hold |
| Webhook is delivered repeatedly/out of order | Event processes once; terminal state is not regressed |
| Captured amount differs | Appointment becomes `PAYMENT_REVIEW`; no automatic confirmation |
| Payment arrives after expiry/cancellation | Payment is recorded; appointment stays closed; refund event is queued |
| Doctor cancels paid booking | Slot is released, status history recorded, refund is queued |
| Refund worker retries after timeout | Same provider idempotency key is reused; no duplicate refund |
| Doctor document bytes differ from declared metadata | Completion is rejected; admin cannot review/download incomplete upload |
| Unverified doctor opens public URL | API returns 404 and no professional document data |
| Patient changes appointment ID | Ownership check returns 404/403 without leaking data |
| Review submitted without completed visit | API rejects it |

## Load and resilience targets

Before launch, test at forecast peak plus 2× headroom. Measure p95 doctor search, p95 availability and p99 booking transaction latency. Inject database failover, Redis loss, Razorpay timeout, duplicate webhook, FCM outage and worker restart. The API must preserve appointment/payment correctness even if notifications are delayed.

## Release gate

No public launch until migrations are tested on a production-sized copy, backup restore succeeds, payment reconciliation balances in test mode, the verification SOP is staffed, monitoring alerts reach an on-call owner, security findings are closed or explicitly risk-accepted, and rollback has been rehearsed.

## CI release gates

GitHub Actions starts isolated PostgreSQL 16 and Redis 7 services, applies migrations, compares the resulting database with the Prisma datamodel, then runs lint, unit tests, E2E invariants and production builds. A production dependency audit blocks high/critical findings. The container job builds the API/worker and admin images from the frozen lockfile and verifies the API runtime user is non-root. A separate Flutter job regenerates the portable Android wrapper, resolves packages, analyzes mobile source and runs Flutter tests.
