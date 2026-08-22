# Private testing release

This release is designed for the CareBook owner/testing team before Firebase, Razorpay, cloud and Play Console accounts exist. It is functionally connected to PostgreSQL and Redis, but OTP and payment are deliberately simulated and visibly labelled.

## Start the complete stack

Install Docker Desktop and Node.js 22+, open a terminal at the repository root, then run:

```bash
corepack enable
pnpm testing:up
```

The startup job applies both database migrations before API traffic is accepted and runs the idempotent seed. It creates ten specializations, the `WELCOME50` coupon, fee configuration, two clinics, three sample approved doctors and one admin.

| Interface | Access |
| --- | --- |
| Admin dashboard | `http://localhost:8080` |
| API/Swagger | `http://localhost:4000/api/docs` |
| Admin login | Locally generated admin number and OTP printed at startup |
| Patient login | Any unused valid Indian number, with the generated OTP |
| Doctor registration | Any other unused valid Indian number, with the generated OTP |

Use only fictional appointment reasons and identities in this private mode. The supplied secrets are local test values, not production credentials.

## Run the mobile app

For an Android emulator on the Docker host:

```bash
cd apps/mobile
flutter create --platforms=android --org in.carebook .
flutter pub get
flutter run --dart-define=CAREBOOK_TEST_MODE=true --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

For a physical Android phone, enter the computer's LAN address (for example `http://192.168.1.20:4000/api/v1`) in the app's **Testing server URL** field and ensure the phone and computer use the same trusted Wi-Fi. The debug APK does not need to be rebuilt when this address changes. Do not expose the local test stack directly to the public internet.

## Generate an APK in GitHub

The workflow runs automatically when the mobile source reaches `main`; it can also be started manually with a reachable API base URL. Download `CareBook-private-test-apk` from the completed workflow's Artifacts section. The resulting APK is debug-signed, permanently labelled `TEST MODE`, allows HTTP only for private testing and expires from GitHub artifact storage after 14 days.

## Test walkthrough

1. Start the stack and wait for `/api/v1/health/ready` to return 200.
2. Sign into the patient app with a new valid Indian number and the OTP printed by `pnpm testing:up`.
3. Open a seeded sample doctor, select a server-returned slot and enter fictional patient details.
4. Confirm the test payment. The appointment becomes confirmed and appears in history; no real charge occurs.
5. Sign into admin and verify appointment/payment analytics.
6. Register a separate doctor account and exercise draft/profile/document/schedule workflows.

Stop services with `pnpm testing:down`. Use `pnpm testing:logs` when diagnosing API or worker behavior.

## Production conversion

Never reuse `.env.testing`. Configure managed PostgreSQL/Redis/storage, Firebase, Razorpay and FCM secrets; set `NODE_ENV=production`, `ALLOW_LOCAL_OTP=false`, `ENABLE_TEST_PAYMENT=false` and `SEED_TEST_DATA=false`; then run `pnpm preflight:production`. Build a signed release APK/AAB with a real application ID and Play signing only after those gates pass.
