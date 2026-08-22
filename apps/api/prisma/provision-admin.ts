import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const phone = process.env.ADMIN_PHONE_E164;
const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'CareBook Admin';

if (!phone?.startsWith('+')) throw new Error('Set ADMIN_PHONE_E164 in E.164 format, for example +919876543210');

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { phoneE164: phone! },
    update: { role: UserRole.ADMIN, displayName },
    create: { phoneE164: phone!, displayName, role: UserRole.ADMIN },
  });
  await prisma.adminUser.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, permissions: ['doctor:verify', 'appointment:manage', 'payment:manage', 'analytics:read'] },
  });
  console.log(`Provisioned admin ${phone}`);
}

void main().finally(async () => prisma.$disconnect());
