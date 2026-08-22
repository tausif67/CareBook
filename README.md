# CareBook

CareBook is a production-oriented MVP foundation for a doctor and clinic appointment marketplace launching in Greater Noida and Noida. The repository contains a NestJS API, PostgreSQL schema and migration, a Flutter patient/doctor app, a React admin console, Docker development services, tests, and operating documentation.

> This repository is an implementation baseline, not a claim that a healthcare marketplace is already live. Before public launch, configure and verify Firebase, Razorpay, private document storage, FCM/SMS, Google Maps, backups, monitoring, legal policies, and an actual doctor-verification operating process.

## MVP delivered

- Patient: OTP exchange, profile, specialties, approved-doctor search, public doctor profile, server-side availability, appointment hold, Razorpay order creation, appointment history, in-app notifications, reviews after completed visits.
- Doctor: self-registration state machine, professional profile, private encrypted document upload, admin-gated approval, schedules, appointment list, dashboard counts and earnings.
- Admin: pre-provisioned OTP access, analytics, doctor/document verification APIs, patients, appointments, payments, commission rules, and audit logs.
- Reliability: serializable booking/rescheduling transactions, per-slot advisory locks, idempotent request keys, expiring payment holds, raw-body webhook HMAC, webhook deduplication, amount reconciliation, automatic idempotent refund worker, durable notifications and dependency-aware readiness probes.

## Repository map

```text
apps/api       NestJS + Prisma API and outbox worker
apps/admin     React + TypeScript operations console
apps/mobile    Flutter patient and doctor application
docs           Architecture, API, database, security, QA and deployment guides
```

## Quick start

Prerequisites: Node.js 22+, pnpm 10+, PostgreSQL 16+, Redis 7+, and Flutter 3.x for mobile development.

1. Copy `.env.example` to `.env` and replace every secret or blank provider value.
2. Start PostgreSQL, Redis and private local object storage: `docker compose up -d postgres redis minio minio-init`.
3. Install packages: `pnpm install`.
4. Generate Prisma Client: `pnpm --filter @carebook/api prisma:generate`.
5. Apply migration: `pnpm --filter @carebook/api prisma:deploy`.
6. Seed specialties, fee rule and development coupon: `pnpm --filter @carebook/api prisma:seed`.
7. Start API and admin: `pnpm dev`.
8. Open Swagger at `http://localhost:4000/api/docs` and admin at `http://localhost:5173`.

For development-only OTP, set `ALLOW_LOCAL_OTP=true`; the API refuses this path when `NODE_ENV=production`.

## Private working test release (no provider accounts required)

This mode is for the owner/testing team while Firebase and Razorpay accounts are not ready. It starts PostgreSQL, Redis, private MinIO storage, migrations, sample data, API, worker and admin dashboard with one command:

```bash
pnpm testing:up
```

Prerequisites: Docker Desktop and Node.js 22+. The command creates `.env.testing` from the committed safe template, builds the stack and seeds three clearly marked sample doctors plus Noida/Greater Noida clinics.

- Admin: `http://localhost:8080`
- API documentation: `http://localhost:4000/api/docs`
- Admin number: generated locally on first start and printed by `pnpm testing:up`
- Test OTP: generated locally on first start and printed by `pnpm testing:up`
- Patient/doctor app: use any unused valid Indian mobile number and the generated OTP
- Payment: the app records a simulated successful payment; no real money is charged

Stop with `pnpm testing:down`; inspect runtime logs with `pnpm testing:logs`. Test OTP/payment endpoints are disabled unless explicit non-production flags are enabled, and production preflight fails if either flag is on.

The manual GitHub workflow `CareBook Test APK` generates a private debug APK. Its `api_base_url` input can point to the Android emulator host (`http://10.0.2.2:4000/api/v1`), a computer address reachable on the same Wi-Fi, or a deployed HTTPS testing API.

### Provision the first admin

Admin accounts never self-register. After migration, run:

```bash
ADMIN_PHONE_E164=+91XXXXXXXXXX ADMIN_DISPLAY_NAME="Operations Admin" \
  pnpm --filter @carebook/api admin:provision
```

The mobile number must also authenticate through the configured Firebase project.

### Run Flutter

The repository stores the portable Flutter source. If native Android wrapper files are not already present on your machine:

```bash
cd apps/mobile
flutter create --platforms=android .
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

For the account-free private release, also pass `--dart-define=CAREBOOK_TEST_MODE=true`.

Add the Firebase Android configuration using the normal Firebase project setup. Razorpay and Maps keys belong in Android build configuration; never commit them.

## Validation

```bash
pnpm verify
pnpm --filter @carebook/api test
pnpm --filter @carebook/api test:e2e
pnpm build
pnpm preflight:production
STAGING_API_BASE_URL=https://api-staging.example.com/api/v1 pnpm smoke:staging
flutter analyze apps/mobile
flutter test apps/mobile
```

The E2E suite requires migrated PostgreSQL and Redis test services. It exercises simultaneous final-slot booking, booking idempotency, signed payment capture and webhook replay. Do not point it at production. `preflight:production` checks the presence and basic safety of production environment configuration without printing secret values; `smoke:staging` verifies liveness, readiness and the deployed OpenAPI contract.

CI installs from the lockfile, validates migrations, rejects schema drift, runs dependency audit/lint/unit/E2E/build gates, then builds both production containers and checks that the API image is non-root.

## Key design decisions

- Money is integer paise; no floating-point financial arithmetic.
- The client never decides availability, fees, verification status, or final payment status.
- Only `APPROVED` doctors appear in public search.
- Payment success comes from a verified webhook, not the mobile callback.
- Appointment details are private to the patient, assigned doctor, and authorised admin. Verification documents use short-lived signed upload/download URLs and admin download audit logs.
- External integrations are adapters configured by environment, not embedded secrets.

See [architecture](docs/architecture.md), [API guide](docs/api.md), [database](docs/database.md), [security](docs/security.md), [QA plan](docs/testing.md), [private testing release](docs/private-testing-release.md), [staging checklist](docs/staging-checklist.md), and [deployment](docs/deployment.md).
