# Deployment guide

## Recommended first production shape

- Managed PostgreSQL 16 with multi-AZ, encryption, PITR and connection pooling.
- Managed Redis 7 for cache/rate-limit/job coordination; appointment truth remains in PostgreSQL.
- Two independently scalable containers from `apps/api/Dockerfile`: API (`dist/main.js`) and worker (`dist/worker.js`).
- Admin static build on a CDN/private origin with strict CSP and authenticated API access.
- Flutter Android app distributed first through an internal track, then staged rollout.
- Private object storage for doctor documents with malware scanning and KMS-managed encryption.
- Managed secrets, central logs/metrics/traces, error reporting and paging.

AWS, Google Cloud and Azure can all satisfy this layout. Choose based on the team's operating skill, not a hard-coded provider dependency.

## Deployment order

1. Provision network, database, Redis, private storage, secrets and observability.
2. Back up the database; run `prisma migrate deploy` as a one-shot release job. Confirm the production-readiness migration added document metadata and reschedule idempotency columns.
3. Deploy API with liveness `/api/v1/health/live`, readiness `/api/v1/health/ready` and a zero-downtime rolling strategy. Readiness requires PostgreSQL and Redis.
4. Deploy worker. Verify outbox lag, failed event count, expired-hold processing and refund retry/reconciliation metrics.
5. Register the exact Razorpay production webhook URL and secret. Replay a signed test event.
6. Configure Firebase authorised Android package/SHA fingerprints and admin web domains.
7. Deploy admin, then run `STAGING_API_BASE_URL=https://<api-host>/api/v1 pnpm smoke:staging`.
8. Start the mobile internal-track release only after smoke and payment-rehearsal gates pass. Monitor booking and payment funnels.

Never run `prisma migrate dev` in production.

## Required environment groups

| Group | Keys |
| --- | --- |
| Core | `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `DEFAULT_TIMEZONE` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, Firebase server credentials |
| Payments | Razorpay key ID, key secret and independent webhook secret |
| Clients | Allowed admin origin, Firebase web values, API base URLs |
| Messaging/maps | FCM enablement, Google Maps key restricted by API/app/domain |

Do not use the same Razorpay credentials between test and production. Restrict Google keys separately for Android, web and server APIs.

## Migration policy

Use backward-compatible expand/migrate/contract changes: add nullable columns/tables, deploy code that writes both shapes, backfill in a controlled job, switch reads, then remove old structures in a later release. Large indexes should be created concurrently in a dedicated operational migration.

## Rollback and recovery

Application rollback must not reverse an already-applied destructive migration. Roll back containers first, keep schema compatible, and use a forward fix. If payment processing is degraded, keep webhooks durably accepted where safe, disable new online checkout via feature configuration and reconcile every provider order against the payment ledger before reopening.

## Production smoke test

- Health/readiness green from every instance.
- Admin login only works for provisioned number.
- Pending doctor is absent from search; approval makes it visible.
- Slot booking produces one `CB-...` ID and an expiring hold.
- Razorpay test capture confirms only after signed webhook.
- Duplicate webhook leaves one successful payment transition.
- Cancellation creates status history and refund event when paid.
- Refund worker changes the provider refund and local payment ledger exactly once.
- Worker creates immediate, 24-hour and 2-hour notifications without exposing visit reasons.
