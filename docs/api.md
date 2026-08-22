# API guide

Base path: `/api/v1`. Interactive OpenAPI: `/api/docs`. Machine-readable OpenAPI: `/api/docs/openapi.json`.

All protected endpoints require `Authorization: Bearer <CareBook JWT>`. Successful create operations return HTTP 201. Validation errors use a stable envelope:

```json
{
  "error": {
    "code": "HTTP_400",
    "message": ["doctorId must be a UUID"],
    "requestId": "..."
  },
  "timestamp": "2026-08-22T12:00:00.000Z",
  "path": "/api/v1/appointments"
}
```

## Core routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | Public | Process liveness; does not query dependencies |
| GET | `/health/ready` | Public | PostgreSQL and Redis readiness; returns 503 if either is down |
| POST | `/auth/otp/exchange` | Public after Firebase OTP | Exchange verified ID token for CareBook JWT |
| GET | `/specializations` | Public | Active English/Hindi specialties |
| GET | `/clinics` | Public | Active clinics, optionally by area |
| GET | `/doctors` | Public | Approved doctor search and filters |
| GET | `/doctors/:id` | Public | Approved public profile |
| GET | `/doctors/:id/availability` | Public | Server-authoritative slots |
| PATCH | `/doctors/me/profile` | Doctor | Save professional profile |
| POST | `/doctors/me/documents/upload-url` | Doctor | Create a bounded short-lived private upload |
| POST | `/doctors/me/documents/:id/complete` | Doctor | Verify uploaded object size/type/checksum/encryption |
| POST | `/doctors/me/submit` | Doctor | Submit for manual review |
| POST | `/doctors/me/schedules` | Doctor | Add schedule window |
| GET | `/doctors/me/dashboard` | Doctor | Counts, status and earnings |
| POST | `/appointments` | Patient | Idempotent booking hold/confirmation |
| GET | `/appointments` | Patient/Doctor | Upcoming/completed/cancelled views |
| POST | `/appointments/:id/cancel` | Owner/Admin | Cancel and enqueue refund if needed |
| POST | `/appointments/:id/reschedule` | Patient | Idempotently move a confirmed booking to a free server slot |
| POST | `/appointments/:id/complete` | Doctor/Admin | Complete an elapsed consultation and unlock verified review |
| POST | `/payments/orders` | Patient | Create/reuse gateway order for owned hold |
| POST | `/payments/test/confirm` | Patient, non-production only | Simulate capture in explicit private test mode |
| POST | `/payments/webhooks/razorpay` | Razorpay | Raw signed webhook |
| POST | `/reviews` | Patient | Review a personally completed appointment |
| GET | `/notifications` | Authenticated | Recent in-app notifications |
| POST | `/notifications/devices` | Authenticated | Register/refresh an FCM device token |
| GET | `/admin/analytics` | Admin | MVP operating metrics |
| PATCH | `/admin/doctor-documents/:id/review` | Admin | Manual document decision |
| GET | `/admin/doctor-documents/:id/download` | Admin | Audited short-lived private document access |
| PATCH | `/admin/doctors/:id/verification` | Admin | Approve/reject/request correction/suspend |

## Idempotency contract

The app generates a UUID `idempotencyKey` per booking attempt. Repeating an identical attempt for the same patient returns the existing appointment. A retry intended to choose a different doctor/date/slot must use a new key. Razorpay orders are also reused for the appointment while pending or successful.

## Webhook contract

The payment endpoint needs the unmodified request bytes and `x-razorpay-signature`. An optional provider event ID is used for deduplication; when absent, the payload SHA-256 becomes the deterministic event key. Return 2xx only after the database transaction commits.

`/payments/test/confirm` exists only for the private account-free testing release. It requires an authenticated patient, appointment ownership, a valid unexpired hold, `ENABLE_TEST_PAYMENT=true` and a non-production runtime. It is idempotent for the appointment. Production preflight rejects the test-payment flag.

## Health contract

Use `/health/live` for container/process restart decisions and `/health/ready` for load-balancer traffic decisions. Readiness intentionally reports only dependency names, status and latency; it never returns connection strings or dependency error text. Redis is included because deployed CareBook instances require it for cache and coordination, while PostgreSQL remains authoritative.
