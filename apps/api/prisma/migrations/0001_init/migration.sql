CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "DoctorStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'CORRECTION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ConsultationType" AS ENUM ('CLINIC', 'ONLINE');
CREATE TYPE "AppointmentStatus" AS ENUM ('PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR', 'EXPIRED', 'PAYMENT_REVIEW');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED');
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'READ');
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED');

CREATE SEQUENCE appointment_number_seq START 1;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firebase_uid text UNIQUE,
  phone_e164 text NOT NULL UNIQUE, email text UNIQUE, display_name text NOT NULL,
  role "UserRole" NOT NULL, status "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  locale text NOT NULL DEFAULT 'en-IN', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth date, gender text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE, platform text NOT NULL, active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_tokens_user_active_idx ON device_tokens(user_id, active);
CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status "DoctorStatus" NOT NULL DEFAULT 'DRAFT', registration_number text, registration_council text,
  registration_year integer, gender text, qualifications jsonb NOT NULL DEFAULT '[]', experience_years integer NOT NULL DEFAULT 0,
  about text, languages text[] NOT NULL DEFAULT ARRAY['English','Hindi'], photo_url text,
  clinic_fee_paise integer NOT NULL DEFAULT 0, online_fee_paise integer, online_enabled boolean NOT NULL DEFAULT false,
  average_rating decimal(3,2) NOT NULL DEFAULT 0, review_count integer NOT NULL DEFAULT 0,
  submitted_at timestamptz, verified_at timestamptz, verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (experience_years >= 0), CHECK (clinic_fee_paise >= 0), CHECK (online_fee_paise IS NULL OR online_fee_paise >= 0)
);
CREATE INDEX doctors_status_rating_idx ON doctors(status, average_rating DESC);

CREATE TABLE doctor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  type text NOT NULL, storage_key text NOT NULL, checksum text NOT NULL,
  status "DocumentStatus" NOT NULL DEFAULT 'PENDING', rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE INDEX doctor_documents_doctor_status_idx ON doctor_documents(doctor_id, status);

CREATE TABLE specializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name_en text NOT NULL,
  name_hi text NOT NULL, icon_key text, active boolean NOT NULL DEFAULT true
);
CREATE TABLE doctor_specializations (
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  specialization_id uuid NOT NULL REFERENCES specializations(id) ON DELETE RESTRICT,
  "primary" boolean NOT NULL DEFAULT false, PRIMARY KEY (doctor_id, specialization_id)
);

CREATE TABLE clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone_e164 text, email text,
  pay_at_clinic_enabled boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinics_name_trgm_idx ON clinics USING gin (name gin_trgm_ops);
CREATE TABLE clinic_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  line1 text NOT NULL, line2 text, area text NOT NULL, city text NOT NULL, state text NOT NULL, postal_code text NOT NULL,
  latitude decimal(9,6), longitude decimal(9,6),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX clinic_addresses_city_area_idx ON clinic_addresses(city, area);
CREATE TABLE clinic_doctors (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true, PRIMARY KEY (clinic_id, doctor_id)
);
CREATE TABLE doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE, day_of_week integer NOT NULL,
  start_minute integer NOT NULL, end_minute integer NOT NULL, break_start_minute integer, break_end_minute integer,
  slot_duration_minutes integer NOT NULL DEFAULT 30, max_appointments_per_slot integer NOT NULL DEFAULT 1,
  consultation_type "ConsultationType" NOT NULL, active boolean NOT NULL DEFAULT true,
  CHECK (day_of_week BETWEEN 0 AND 6), CHECK (start_minute BETWEEN 0 AND 1439), CHECK (end_minute BETWEEN 1 AND 1440),
  CHECK (start_minute < end_minute), CHECK (slot_duration_minutes BETWEEN 5 AND 240), CHECK (max_appointments_per_slot BETWEEN 1 AND 20),
  CHECK ((break_start_minute IS NULL AND break_end_minute IS NULL) OR (break_start_minute >= start_minute AND break_end_minute <= end_minute AND break_start_minute < break_end_minute))
);
CREATE INDEX doctor_schedules_lookup_idx ON doctor_schedules(doctor_id, day_of_week, active);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, type "CouponType" NOT NULL,
  value integer NOT NULL, maximum_discount_paise integer, minimum_booking_paise integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, usage_limit integer,
  per_patient_limit integer NOT NULL DEFAULT 1, first_booking_only boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  CHECK (value > 0), CHECK (minimum_booking_paise >= 0), CHECK (starts_at < expires_at)
);
CREATE INDEX coupons_active_window_idx ON coupons(active, starts_at, expires_at);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_id text NOT NULL UNIQUE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT, consultation_type "ConsultationType" NOT NULL,
  status "AppointmentStatus" NOT NULL DEFAULT 'PAYMENT_PENDING', start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata', patient_name text NOT NULL, patient_age integer NOT NULL,
  patient_gender text NOT NULL, patient_phone_e164 text NOT NULL, reason_for_visit text NOT NULL,
  consultation_fee_paise integer NOT NULL, platform_fee_paise integer NOT NULL, discount_paise integer NOT NULL DEFAULT 0,
  total_paise integer NOT NULL, coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL, hold_expires_at timestamptz,
  idempotency_key text NOT NULL, cancellation_reason text, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, idempotency_key), CHECK (start_at < end_at), CHECK (patient_age BETWEEN 0 AND 125),
  CHECK (consultation_fee_paise >= 0 AND platform_fee_paise >= 0 AND discount_paise >= 0 AND total_paise >= 0)
);
CREATE INDEX appointments_doctor_slot_idx ON appointments(doctor_id, start_at, status);
CREATE INDEX appointments_patient_start_idx ON appointments(patient_id, start_at DESC);
CREATE INDEX appointments_active_slot_idx
  ON appointments(doctor_id, start_at)
  WHERE status IN ('PAYMENT_PENDING','CONFIRMED','CHECKED_IN');

CREATE TABLE appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status "AppointmentStatus", to_status "AppointmentStatus" NOT NULL, reason text, actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_history_idx ON appointment_status_history(appointment_id, created_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'razorpay', gateway_order_id text NOT NULL UNIQUE, gateway_payment_id text UNIQUE,
  amount_paise integer NOT NULL, currency text NOT NULL DEFAULT 'INR', status "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  method text, failure_code text, failure_description text, captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (amount_paise > 0)
);
CREATE INDEX payments_appointment_status_idx ON payments(appointment_id, status);
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  gateway_refund_id text UNIQUE, amount_paise integer NOT NULL, reason text NOT NULL,
  status "RefundStatus" NOT NULL DEFAULT 'PENDING', failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (amount_paise > 0)
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  rating integer NOT NULL, comment text, moderated boolean NOT NULL DEFAULT false, visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX reviews_doctor_visible_idx ON reviews(doctor_id, visible, created_at DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel "NotificationChannel" NOT NULL, template text NOT NULL, title text NOT NULL, body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}', status "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
  scheduled_at timestamptz, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_delivery_idx ON notifications(status, scheduled_at);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, appointment_id uuid NOT NULL UNIQUE,
  discount_paise integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_usage_patient_idx ON coupon_usage(coupon_id, patient_id);

CREATE TABLE commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid REFERENCES doctors(id) ON DELETE CASCADE,
  percentage_basis_points integer NOT NULL DEFAULT 0, fixed_platform_fee_paise integer NOT NULL DEFAULT 0,
  patient_convenience_fee_paise integer NOT NULL DEFAULT 0, effective_from timestamptz NOT NULL,
  effective_to timestamptz, active boolean NOT NULL DEFAULT true,
  CHECK (percentage_basis_points BETWEEN 0 AND 10000), CHECK (fixed_platform_fee_paise >= 0),
  CHECK (patient_convenience_fee_paise >= 0), CHECK (effective_to IS NULL OR effective_from < effective_to)
);
CREATE INDEX commission_rules_lookup_idx ON commission_rules(doctor_id, active, effective_from DESC);

CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  permissions text[] NOT NULL DEFAULT '{}', last_login_at timestamptz
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, before jsonb, after jsonb, ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, event_id text NOT NULL,
  event_type text NOT NULL, payload_hash text NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic text NOT NULL, aggregate_id text NOT NULL,
  payload jsonb NOT NULL, available_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_events(processed_at, available_at);

CREATE INDEX users_display_name_trgm_idx ON users USING gin (display_name gin_trgm_ops);
