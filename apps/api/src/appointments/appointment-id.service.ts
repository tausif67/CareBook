import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class AppointmentIdService {
  async next(tx: Prisma.TransactionClient, now = new Date()): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`SELECT nextval('appointment_number_seq') AS value`);
    return `CB-${now.getUTCFullYear()}-${rows[0].value.toString().padStart(6, '0')}`;
  }
}

