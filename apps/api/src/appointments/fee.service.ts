import { BadRequestException, Injectable } from '@nestjs/common';
import { Coupon, CouponType, Doctor, Prisma } from '@prisma/client';

export interface FeeQuote {
  consultationFeePaise: number;
  platformFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  commissionPaise: number;
  doctorSettlementPaise: number;
  couponId?: string;
}

export function calculateFeeQuote(input: {
  consultationFeePaise: number;
  percentageBasisPoints: number;
  fixedPlatformFeePaise: number;
  patientConvenienceFeePaise: number;
  coupon?: Pick<Coupon, 'id' | 'type' | 'value' | 'maximumDiscountPaise'>;
}): FeeQuote {
  const commissionPaise = Math.floor(input.consultationFeePaise * input.percentageBasisPoints / 10_000) + input.fixedPlatformFeePaise;
  const subtotal = input.consultationFeePaise + input.patientConvenienceFeePaise;
  let discountPaise = 0;
  if (input.coupon) {
    discountPaise = input.coupon.type === CouponType.PERCENTAGE
      ? Math.floor(subtotal * input.coupon.value / 10_000)
      : input.coupon.value;
    if (input.coupon.maximumDiscountPaise !== null) discountPaise = Math.min(discountPaise, input.coupon.maximumDiscountPaise);
    discountPaise = Math.min(discountPaise, subtotal);
  }
  return {
    consultationFeePaise: input.consultationFeePaise,
    platformFeePaise: input.patientConvenienceFeePaise,
    discountPaise,
    totalPaise: subtotal - discountPaise,
    commissionPaise,
    doctorSettlementPaise: Math.max(0, input.consultationFeePaise - commissionPaise),
    couponId: input.coupon?.id,
  };
}

@Injectable()
export class FeeService {
  async quote(tx: Prisma.TransactionClient, doctor: Doctor, patientId: string, couponCode?: string): Promise<FeeQuote> {
    const now = new Date();
    const doctorRule = await tx.commissionRule.findFirst({
      where: { doctorId: doctor.id, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const globalRule = doctorRule ?? await tx.commissionRule.findFirst({
      where: { doctorId: null, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!globalRule) throw new BadRequestException('Booking fee configuration is unavailable');

    let coupon: Coupon | undefined;
    if (couponCode) {
      coupon = await tx.coupon.findFirst({
        where: { code: couponCode.toUpperCase(), active: true, startsAt: { lte: now }, expiresAt: { gt: now } },
      }) ?? undefined;
      if (!coupon) throw new BadRequestException('Coupon is invalid or expired');
      if (doctor.clinicFeePaise < coupon.minimumBookingPaise) throw new BadRequestException('Booking value does not meet coupon minimum');
      const patientUses = await tx.couponUsage.count({ where: { couponId: coupon.id, patientId } });
      if (patientUses >= coupon.perPatientLimit) throw new BadRequestException('Coupon usage limit reached');
      if (coupon.usageLimit !== null && await tx.couponUsage.count({ where: { couponId: coupon.id } }) >= coupon.usageLimit) {
        throw new BadRequestException('Coupon usage limit reached');
      }
      if (coupon.firstBookingOnly && await tx.appointment.count({ where: { patientId, status: { not: 'EXPIRED' } } }) > 0) {
        throw new BadRequestException('Coupon is available only for the first booking');
      }
    }

    return calculateFeeQuote({
      consultationFeePaise: doctor.clinicFeePaise,
      percentageBasisPoints: globalRule.percentageBasisPoints,
      fixedPlatformFeePaise: globalRule.fixedPlatformFeePaise,
      patientConvenienceFeePaise: globalRule.patientConvenienceFeePaise,
      coupon,
    });
  }
}

