import { AppointmentIdService } from './appointment-id.service.js';

describe('AppointmentIdService', () => {
  it('generates the documented public format', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ value: 123n }]) };
    const id = await new AppointmentIdService().next(tx as never, new Date('2026-08-22T00:00:00Z'));
    expect(id).toBe('CB-2026-000123');
  });
});

