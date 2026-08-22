# Security and privacy checklist

## Enforced in this baseline

- Firebase ID tokens establish verified phone ownership; CareBook issues short-lived, audience/issuer-bound JWTs.
- Admins are pre-provisioned; sending an OTP to an arbitrary phone cannot create an admin.
- Global authentication and role guards protect controllers by default. Public routes require an explicit decorator.
- DTO allow-list validation rejects unknown input fields.
- Approved-doctor filtering prevents pending/rejected/suspended profiles from public search.
- Patient and doctor ownership is checked for appointments, payments, cancellations, notifications and reviews.
- Raw Razorpay webhook bytes are verified with SHA-256 HMAC and timing-safe comparison.
- Payment event IDs/hashes are unique, amounts are reconciled, and mobile payment callbacks never confirm appointments.
- No raw card data is accepted or stored.
- Admin decisions create audit rows. Verification requires document decisions; the UI must never label a doctor verified merely because documents were uploaded.
- Doctor documents use bounded MIME/size rules, SHA-256 metadata, encrypted object storage, short-lived signed URLs and audited admin downloads. Public and general admin list responses omit storage keys and checksums.
- Secrets are environment variables and `.env` is ignored.
- Helmet, strict CORS, input bounds, non-root API container and generic 5xx responses reduce common attack surface. Structured request logs carry validated/generated correlation IDs and redact authorization, cookie and set-cookie headers.
- CI uses frozen dependencies, high-severity production dependency audit, Prisma migration-drift detection and reproducible container-build gates. Readiness errors expose dependency state but never connection strings or raw failure messages.
- Account-free OTP and payment simulation require explicit test flags and a non-production runtime. The production preflight fails closed when `ALLOW_LOCAL_OTP` or `ENABLE_TEST_PAYMENT` is enabled; test UI surfaces a permanent `TEST MODE` label and never represents simulated money as a real gateway payment.

## Mandatory before production launch

1. Put API/admin behind managed TLS, WAF and DDoS controls. Enforce HTTPS/HSTS at the edge.
2. Add API gateway rate limits: strict limits for OTP exchange, auth failures, search scraping, booking attempts and webhooks. Use phone/IP/device-aware rules without blocking shared networks indiscriminately.
3. Enable object-created malware scanning and independent MIME sniffing before verification staff open uploaded documents. The signed/encrypted upload boundary is implemented; malware scanning remains a deployment gate.
4. Configure Firebase App Check/Play Integrity where appropriate, OTP abuse controls and authorised domains.
5. Add FCM device-token registration with token rotation and avoid diagnosis/reason text in notification previews.
6. Use a secrets manager and rotate database, JWT, Firebase and Razorpay credentials. Webhook secret rotation needs a dual-secret window.
7. Add central structured logs, metrics, traces and alerts. Redact phone numbers, appointment reasons, tokens, provider payloads and document URLs.
8. Enable encrypted PostgreSQL backups with tested point-in-time restore. Restrict production DB access by network and least-privilege roles.
9. Commission, cancellation and refund policies require versioning and user-visible acceptance. A refund worker needs reconciliation, retry limits and an operations queue.
10. Complete threat modelling, dependency/SAST/DAST scans, mobile certificate/network policy review, external penetration test and incident-response exercise.
11. Obtain Indian legal/privacy review for the Digital Personal Data Protection framework, consumer/payment obligations, consent, grievance flow, retention/deletion and processor contracts. This document is engineering guidance, not legal advice.

## Sensitive-data rules

- Collect the minimum necessary for booking. `reasonForVisit` is visible only to the involved patient, doctor and authorised support role.
- Never return medical registration document keys through public doctor responses.
- Hash or truncate network identifiers in audit logs.
- Add data export, correction and deletion workflows with exceptions for legally required payment/accounting records.
- Future prescriptions, records and AI symptom data require a separate clinical-data security review and explicit consent model.

## Admin controls to add at launch

Use step-up authentication for suspensions, refunds and commission changes; granular permissions; maker-checker approval for high-value refunds; session revocation; device/session inventory; and alerts for bulk exports or unusual verification activity.
