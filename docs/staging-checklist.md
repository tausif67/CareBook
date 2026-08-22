# Staging readiness checklist

## Provider configuration

- Create separate staging projects/accounts for Firebase, Razorpay and object storage. Never reuse production keys.
- Configure Firebase Android package name/SHA fingerprints and admin-web authorised domain.
- Register Razorpay webhook at `/api/v1/payments/webhooks/razorpay`; keep its secret different from the API key secret.
- Create a private object-storage bucket in India where appropriate, block all public access, enable versioning, encryption, access logs, lifecycle rules and malware-scanning events.
- Restrict Google Maps keys by Android package/SHA, web origin or server IP/API as applicable.

## Database and services

- Create managed PostgreSQL and Redis instances on private networking.
- Run `prisma migrate deploy` once as a release job; verify both `0001_init` and `0002_production_readiness`.
- Seed specialties and the initial commission rule, then provision admin mobile numbers through the provisioning script.
- Deploy separate API and worker processes. Alert on outbox lag, failed refunds, payment-review appointments and pending doctor verification age.
- Configure the load balancer to remove an instance when `/api/v1/health/ready` returns 503; use `/api/v1/health/live` only for process restart decisions.

## Verification flow

- Upload one PDF and one image through the doctor app; confirm object encryption, checksum metadata and private ACL.
- Confirm an admin can open a five-minute link and an audit row is written.
- Connect malware scanning before real identity documents are accepted.
- Approve only after registration, qualification and government-ID documents are individually reviewed.

## Booking and money rehearsal

- Simultaneously book the last slot from two patient accounts; capacity must not be exceeded.
- Capture a Razorpay test payment and replay the webhook; one payment transition and one confirmation must result.
- Reschedule twice with the same idempotency key; the second request must return the same appointment state.
- Cancel a paid appointment; verify an idempotent refund, payment ledger update and patient notification.
- Reconcile CareBook payments/refunds against the Razorpay test dashboard.

## Release command

Load production-like environment variables and run `pnpm preflight:production`. A passing preflight does not replace security review, restore testing, provider reconciliation or legal approval.

After deployment, run `STAGING_API_BASE_URL=https://<api-host>/api/v1 pnpm smoke:staging`. This read-only smoke check validates liveness, PostgreSQL, Redis and the public OpenAPI contract without using patient credentials.
