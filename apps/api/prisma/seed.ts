import { ConsultationType, CouponType, DoctorStatus, PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const specialties = [
  ['general-physician', 'General Physician', 'सामान्य चिकित्सक'],
  ['dentist', 'Dentist', 'दंत चिकित्सक'],
  ['dermatologist', 'Dermatologist', 'त्वचा विशेषज्ञ'],
  ['pediatrician', 'Pediatrician', 'बाल रोग विशेषज्ञ'],
  ['orthopedic', 'Orthopedic', 'हड्डी रोग विशेषज्ञ'],
  ['gynecologist', 'Gynecologist', 'स्त्री रोग विशेषज्ञ'],
  ['cardiologist', 'Cardiologist', 'हृदय विशेषज्ञ'],
  ['ent', 'ENT', 'कान, नाक और गला विशेषज्ञ'],
  ['ophthalmologist', 'Eye Specialist', 'नेत्र विशेषज्ञ'],
  ['psychiatrist', 'Psychiatrist', 'मनोचिकित्सक'],
] as const;

const testClinics = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    addressId: '21000000-0000-0000-0000-000000000001',
    name: 'CareBook Alpha Health Clinic',
    line1: 'Fictional Demo Address 1',
    area: 'Alpha 2',
    city: 'Greater Noida',
    postalCode: '000000',
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    addressId: '21000000-0000-0000-0000-000000000002',
    name: 'CareBook Sector 18 Clinic',
    line1: 'Fictional Demo Address 2',
    area: 'Sector 18',
    city: 'Noida',
    postalCode: '000000',
  },
] as const;

const testDoctors = [
  {
    phone: '+999000000001',
    name: 'CareBook Demo Doctor A',
    registrationNumber: 'DEMO-NOT-A-LICENSE-001',
    specialization: 'general-physician',
    qualification: 'Fictional qualification fixture',
    experienceYears: 9,
    clinicFeePaise: 50000,
    onlineFeePaise: 45000,
    clinicId: testClinics[0].id,
    startMinute: 600,
    endMinute: 780,
    gender: 'Female',
  },
  {
    phone: '+999000000002',
    name: 'CareBook Demo Doctor B',
    registrationNumber: 'DEMO-NOT-A-LICENSE-002',
    specialization: 'dentist',
    qualification: 'Fictional qualification fixture',
    experienceYears: 7,
    clinicFeePaise: 60000,
    onlineFeePaise: null,
    clinicId: testClinics[1].id,
    startMinute: 960,
    endMinute: 1140,
    gender: 'Male',
  },
  {
    phone: '+999000000003',
    name: 'CareBook Demo Doctor C',
    registrationNumber: 'DEMO-NOT-A-LICENSE-003',
    specialization: 'dermatologist',
    qualification: 'Fictional qualification fixture',
    experienceYears: 11,
    clinicFeePaise: 70000,
    onlineFeePaise: 60000,
    clinicId: testClinics[0].id,
    startMinute: 840,
    endMinute: 1020,
    gender: 'Female',
  },
] as const;

async function seedCoreData(): Promise<void> {
  for (const [slug, nameEn, nameHi] of specialties) {
    await prisma.specialization.upsert({
      where: { slug },
      update: { nameEn, nameHi, active: true },
      create: { slug, nameEn, nameHi },
    });
  }

  await prisma.commissionRule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { percentageBasisPoints: 1000, patientConvenienceFeePaise: 5000, active: true },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      percentageBasisPoints: 1000,
      fixedPlatformFeePaise: 0,
      patientConvenienceFeePaise: 5000,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'WELCOME50' },
    update: { active: true, expiresAt: new Date('2030-01-01T00:00:00Z') },
    create: {
      code: 'WELCOME50',
      type: CouponType.FIXED,
      value: 5000,
      minimumBookingPaise: 10000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      firstBookingOnly: true,
      perPatientLimit: 1,
    },
  });
}

async function seedPrivateTestRelease(): Promise<void> {
  const testAdminPhone = process.env.TEST_ADMIN_PHONE_E164;
  if (!testAdminPhone) throw new Error('TEST_ADMIN_PHONE_E164 is required when SEED_TEST_DATA=true');
  const admin = await prisma.user.upsert({
    where: { phoneE164: testAdminPhone },
    update: { displayName: 'CareBook Test Admin', role: UserRole.ADMIN, status: 'ACTIVE' },
    create: { phoneE164: testAdminPhone, displayName: 'CareBook Test Admin', role: UserRole.ADMIN },
  });
  await prisma.adminUser.upsert({
    where: { userId: admin.id },
    update: { permissions: ['doctors:verify', 'patients:read', 'appointments:manage', 'payments:read', 'commission:manage', 'analytics:read'] },
    create: { userId: admin.id, permissions: ['doctors:verify', 'patients:read', 'appointments:manage', 'payments:read', 'commission:manage', 'analytics:read'] },
  });

  for (const clinic of testClinics) {
    await prisma.clinic.upsert({
      where: { id: clinic.id },
      update: { name: clinic.name, phoneE164: null, active: true, payAtClinicEnabled: true },
      create: { id: clinic.id, name: clinic.name, phoneE164: null, active: true, payAtClinicEnabled: true },
    });
    await prisma.clinicAddress.upsert({
      where: { id: clinic.addressId },
      update: {
        line1: clinic.line1,
        area: clinic.area,
        city: clinic.city,
        state: 'Uttar Pradesh',
        postalCode: clinic.postalCode,
        latitude: null,
        longitude: null,
      },
      create: {
        id: clinic.addressId,
        clinicId: clinic.id,
        line1: clinic.line1,
        area: clinic.area,
        city: clinic.city,
        state: 'Uttar Pradesh',
        postalCode: clinic.postalCode,
        latitude: null,
        longitude: null,
      },
    });
  }

  for (const [doctorIndex, fixture] of testDoctors.entries()) {
    const user = await prisma.user.upsert({
      where: { phoneE164: fixture.phone },
      update: { displayName: fixture.name, role: UserRole.DOCTOR, status: 'ACTIVE' },
      create: { phoneE164: fixture.phone, displayName: fixture.name, role: UserRole.DOCTOR },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {
        status: DoctorStatus.APPROVED,
        registrationNumber: fixture.registrationNumber,
        registrationCouncil: 'DEMO DATA — NOT VERIFIED',
        registrationYear: 2020,
        gender: fixture.gender,
        qualifications: [fixture.qualification],
        experienceYears: fixture.experienceYears,
        about: 'Fictional fixture for local software testing. This is not a real medical professional.',
        clinicFeePaise: fixture.clinicFeePaise,
        onlineFeePaise: fixture.onlineFeePaise,
        onlineEnabled: fixture.onlineFeePaise !== null,
        verifiedAt: new Date(),
      },
      create: {
        userId: user.id,
        status: DoctorStatus.APPROVED,
        registrationNumber: fixture.registrationNumber,
        registrationCouncil: 'DEMO DATA — NOT VERIFIED',
        registrationYear: 2020,
        gender: fixture.gender,
        qualifications: [fixture.qualification],
        experienceYears: fixture.experienceYears,
        about: 'Fictional fixture for local software testing. This is not a real medical professional.',
        clinicFeePaise: fixture.clinicFeePaise,
        onlineFeePaise: fixture.onlineFeePaise,
        onlineEnabled: fixture.onlineFeePaise !== null,
        verifiedAt: new Date(),
      },
    });
    const specialization = await prisma.specialization.findUniqueOrThrow({ where: { slug: fixture.specialization } });
    await prisma.doctorSpecialization.upsert({
      where: { doctorId_specializationId: { doctorId: doctor.id, specializationId: specialization.id } },
      update: { primary: true },
      create: { doctorId: doctor.id, specializationId: specialization.id, primary: true },
    });
    await prisma.clinicDoctor.upsert({
      where: { clinicId_doctorId: { clinicId: fixture.clinicId, doctorId: doctor.id } },
      update: { active: true },
      create: { clinicId: fixture.clinicId, doctorId: doctor.id, active: true },
    });

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const scheduleId = `30000000-0000-0000-0000-${String(doctorIndex + 1).padStart(2, '0')}${String(dayOfWeek).padStart(10, '0')}`;
      await prisma.doctorSchedule.upsert({
        where: { id: scheduleId },
        update: {
          doctorId: doctor.id,
          clinicId: fixture.clinicId,
          dayOfWeek,
          startMinute: fixture.startMinute,
          endMinute: fixture.endMinute,
          slotDurationMinutes: 30,
          maxAppointmentsPerSlot: 1,
          consultationType: ConsultationType.CLINIC,
          active: true,
        },
        create: {
          id: scheduleId,
          doctorId: doctor.id,
          clinicId: fixture.clinicId,
          dayOfWeek,
          startMinute: fixture.startMinute,
          endMinute: fixture.endMinute,
          slotDurationMinutes: 30,
          maxAppointmentsPerSlot: 1,
          consultationType: ConsultationType.CLINIC,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  await seedCoreData();
  if (process.env.SEED_TEST_DATA === 'true' && process.env.NODE_ENV !== 'production') {
    await seedPrivateTestRelease();
  }
}

main()
  .finally(async () => prisma.$disconnect());
