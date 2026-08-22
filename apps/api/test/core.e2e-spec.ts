import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppointmentStatus, ConsultationType, DoctorStatus, PaymentStatus, UserRole } from '@prisma/client';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

describe('CareBook production invariants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctorId: string;
  let clinicId: string;
  let patientOneId: string;
  let patientOneToken: string;
  let patientTwoToken: string;

  const suffix = String(Date.now()).slice(-4);
  const phones = [`+91970000${suffix}`, `+91970001${suffix}`, `+91970002${suffix}`];
  const webhookEventId = `carebook-e2e-payment-${suffix}`;
  const localOtp = String(randomInt(100000, 1000000));
  const webhookSecret = randomBytes(32).toString('hex');

  const slotAt = (hour: number, minute: number): Date => {
    const indiaNow = new Date(Date.now() + 330 * 60_000);
    return new Date(Date.UTC(
      indiaNow.getUTCFullYear(),
      indiaNow.getUTCMonth(),
      indiaNow.getUTCDate() + 3,
      hour,
      minute,
    ) - 330 * 60_000);
  };

  const exchangeOtp = async (phone: string): Promise<{ token: string; patientId: string }> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/exchange')
      .send({ phone, localOtp, role: UserRole.PATIENT, displayName: 'E2E Patient' })
      .expect(201);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { userId: response.body.user.id as string } });
    return { token: response.body.accessToken as string, patientId: patient.id };
  };

  const bookingPayload = (startAt: Date, idempotencyKey: string, phone: string) => ({
    doctorId,
    clinicId,
    consultationType: ConsultationType.CLINIC,
    startAt: startAt.toISOString(),
    patientName: 'E2E Patient',
    patientAge: 30,
    patientGender: 'Male',
    patientPhoneE164: phone,
    reasonForVisit: 'Production invariant integration test',
    paymentMode: 'PAY_AT_CLINIC',
    idempotencyKey,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LOCAL_OTP = 'true';
    process.env.LOCAL_OTP_CODE = localOtp;
    process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64url');
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.ENABLE_TEST_PAYMENT = 'true';
    process.env.ADMIN_WEB_ORIGIN ??= 'http://localhost:5173';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const doctorUser = await prisma.user.create({
      data: { phoneE164: phones[2], displayName: 'Dr. E2E CareBook', role: UserRole.DOCTOR },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        status: DoctorStatus.APPROVED,
        registrationNumber: `E2E-${suffix}`,
        registrationCouncil: 'Test Medical Council',
        registrationYear: 2020,
        experienceYears: 5,
        clinicFeePaise: 50_000,
        verifiedAt: new Date(),
      },
    });
    doctorId = doctor.id;
    const clinic = await prisma.clinic.create({
      data: {
        name: `CareBook E2E Clinic ${suffix}`,
        payAtClinicEnabled: true,
        addresses: {
          create: { line1: 'Alpha 2', area: 'Greater Noida', city: 'Greater Noida', state: 'Uttar Pradesh', postalCode: '201308' },
        },
      },
    });
    clinicId = clinic.id;
    await prisma.clinicDoctor.create({ data: { clinicId, doctorId } });
    await prisma.doctorSchedule.create({
      data: {
        doctorId,
        clinicId,
        consultationType: ConsultationType.CLINIC,
        dayOfWeek: new Date(slotAt(10, 0).getTime() + 330 * 60_000).getUTCDay(),
        startMinute: 600,
        endMinute: 660,
        slotDurationMinutes: 30,
        maxAppointmentsPerSlot: 1,
      },
    });
    await prisma.commissionRule.create({
      data: {
        doctorId,
        percentageBasisPoints: 1_000,
        fixedPlatformFeePaise: 0,
        patientConvenienceFeePaise: 5_000,
        effectiveFrom: new Date(Date.now() - 60_000),
      },
    });

    const patientOne = await exchangeOtp(phones[0]);
    const patientTwo = await exchangeOtp(phones[1]);
    patientOneId = patientOne.patientId;
    patientOneToken = patientOne.token;
    patientTwoToken = patientTwo.token;
  });

  afterAll(async () => {
    const patients = await prisma.patient.findMany({ where: { user: { phoneE164: { in: phones.slice(0, 2) } } }, select: { id: true } });
    const patientIds = patients.map((patient) => patient.id);
    const appointments = await prisma.appointment.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } });
    const appointmentIds = appointments.map((appointment) => appointment.id);
    const payments = await prisma.payment.findMany({ where: { appointmentId: { in: appointmentIds } }, select: { id: true } });
    const paymentIds = payments.map((payment) => payment.id);

    await prisma.paymentWebhookEvent.deleteMany({ where: { eventId: webhookEventId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...appointmentIds, ...paymentIds] } } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.commissionRule.deleteMany({ where: { doctorId } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId } });
    await prisma.clinicDoctor.deleteMany({ where: { doctorId } });
    await prisma.clinicAddress.deleteMany({ where: { clinicId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.doctor.delete({ where: { id: doctorId } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.user.deleteMany({ where: { phoneE164: { in: phones } } });
    await app.close();
  });

  it('reports liveness and verifies PostgreSQL plus Redis readiness', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(ready.body).toMatchObject({
      status: 'ready',
      dependencies: { postgresql: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('allows only one patient to reserve the final slot under concurrency', async () => {
    const startAt = slotAt(10, 0);
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientOneToken}`)
        .send(bookingPayload(startAt, randomUUID(), phones[0])),
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientTwoToken}`)
        .send(bookingPayload(startAt, randomUUID(), phones[1])),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    await expect(prisma.appointment.count({
      where: { doctorId, startAt, status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PAYMENT_PENDING] } },
    })).resolves.toBe(1);
  });

  it('returns the same appointment when a booking request is retried', async () => {
    const idempotencyKey = randomUUID();
    const payload = bookingPayload(slotAt(10, 30), idempotencyKey, phones[0]);
    const first = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patientOneToken}`)
      .send(payload)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patientOneToken}`)
      .send(payload)
      .expect(201);

    expect(retry.body.id).toBe(first.body.id);
    await expect(prisma.appointment.count({ where: { patientId: patientOneId, idempotencyKey } })).resolves.toBe(1);
  });

  it('processes a signed captured-payment webhook exactly once', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        publicId: `CB-E2E-${suffix}`,
        patientId: patientOneId,
        doctorId,
        clinicId,
        consultationType: ConsultationType.CLINIC,
        status: AppointmentStatus.PAYMENT_PENDING,
        startAt: slotAt(11, 0),
        endAt: slotAt(11, 30),
        patientName: 'E2E Payment Patient',
        patientAge: 30,
        patientGender: 'Male',
        patientPhoneE164: phones[0],
        reasonForVisit: 'Payment webhook integration test',
        consultationFeePaise: 50_000,
        platformFeePaise: 5_000,
        totalPaise: 55_000,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        idempotencyKey: randomUUID(),
      },
    });
    const payment = await prisma.payment.create({
      data: { appointmentId: appointment.id, gatewayOrderId: `order_e2e_${suffix}`, amountPaise: 55_000 },
    });
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_e2e_${suffix}`, order_id: payment.gatewayOrderId, amount: 55_000, method: 'upi' } } },
    });
    const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', webhookEventId)
      .send(rawBody)
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', webhookEventId)
      .send(rawBody)
      .expect(201);

    expect(duplicate.body).toMatchObject({ received: true, duplicate: true });
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({ status: PaymentStatus.SUCCESSFUL });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).resolves.toMatchObject({ status: AppointmentStatus.CONFIRMED });
    await expect(prisma.paymentWebhookEvent.count({ where: { eventId: webhookEventId } })).resolves.toBe(1);
  });

  it('confirms a simulated payment only through the explicit non-production route', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        publicId: `CB-E2E-TEST-${suffix}`,
        patientId: patientOneId,
        doctorId,
        clinicId,
        consultationType: ConsultationType.CLINIC,
        status: AppointmentStatus.PAYMENT_PENDING,
        startAt: slotAt(12, 0),
        endAt: slotAt(12, 30),
        patientName: 'E2E Test Payment',
        patientAge: 30,
        patientGender: 'Male',
        patientPhoneE164: phones[0],
        reasonForVisit: 'Explicit private test payment route',
        consultationFeePaise: 50_000,
        platformFeePaise: 5_000,
        totalPaise: 55_000,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        idempotencyKey: randomUUID(),
      },
    });

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments/test/confirm')
      .set('Authorization', `Bearer ${patientOneToken}`)
      .send({ appointmentId: appointment.id })
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post('/api/v1/payments/test/confirm')
      .set('Authorization', `Bearer ${patientOneToken}`)
      .send({ appointmentId: appointment.id })
      .expect(201);

    expect(first.body).toMatchObject({ testMode: true, appointment: { status: AppointmentStatus.CONFIRMED } });
    expect(retry.body.payment.id).toBe(first.body.payment.id);
    await expect(prisma.payment.count({ where: { appointmentId: appointment.id } })).resolves.toBe(1);
  });

  it('rejects an unsigned payment webhook', () => request(app.getHttpServer())
    .post('/api/v1/payments/webhooks/razorpay')
    .send({ event: 'payment.captured' })
    .expect(401));
});
