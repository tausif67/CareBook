import { CouponType } from '@prisma/client';
import { calculateFeeQuote } from './fee.service.js';

describe('calculateFeeQuote', () => {
  it('keeps all monetary calculations in integer paise', () => {
    expect(calculateFeeQuote({
      consultationFeePaise: 50_000,
      percentageBasisPoints: 1000,
      fixedPlatformFeePaise: 0,
      patientConvenienceFeePaise: 5_000,
    })).toEqual({
      consultationFeePaise: 50_000,
      platformFeePaise: 5_000,
      discountPaise: 0,
      totalPaise: 55_000,
      commissionPaise: 5_000,
      doctorSettlementPaise: 45_000,
      couponId: undefined,
    });
  });

  it('caps percentage coupons and never makes a negative total', () => {
    const quote = calculateFeeQuote({
      consultationFeePaise: 50_000,
      percentageBasisPoints: 0,
      fixedPlatformFeePaise: 0,
      patientConvenienceFeePaise: 5_000,
      coupon: { id: 'coupon', type: CouponType.PERCENTAGE, value: 5_000, maximumDiscountPaise: 5_000 },
    });
    expect(quote.discountPaise).toBe(5_000);
    expect(quote.totalPaise).toBe(50_000);
  });
});

