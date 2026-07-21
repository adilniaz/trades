import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirstCompany, mockFindFirstTransaction } = vi.hoisted(() => ({
  mockFindFirstCompany: vi.fn(),
  mockFindFirstTransaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: mockFindFirstCompany },
    transaction: { findFirst: mockFindFirstTransaction },
  },
}));

import {
  matchCompanyByIsin,
  hasDuplicateTransaction,
} from '@/lib/pdf-import-matching';

beforeEach(() => {
  mockFindFirstCompany.mockReset();
  mockFindFirstTransaction.mockReset();
});

describe('matchCompanyByIsin', () => {
  it('looks up an active, approved company by ISIN', async () => {
    mockFindFirstCompany.mockResolvedValue({ id: 'c1', isin: 'HK0285041858' });
    const result = await matchCompanyByIsin('HK0285041858');
    expect(result).toEqual({ id: 'c1', isin: 'HK0285041858' });
    expect(mockFindFirstCompany).toHaveBeenCalledWith({
      where: { isin: 'HK0285041858', status: 'APPROVED', deletedAt: null },
    });
  });

  it('returns null when no company matches', async () => {
    mockFindFirstCompany.mockResolvedValue(null);
    const result = await matchCompanyByIsin('XX0000000000');
    expect(result).toBeNull();
  });
});

describe('hasDuplicateTransaction', () => {
  it('returns true when a matching transaction already exists that day', async () => {
    mockFindFirstTransaction.mockResolvedValue({ id: 't1' });
    const result = await hasDuplicateTransaction({
      userId: 'u1',
      companyId: 'c1',
      type: 'BUY',
      date: new Date('2025-05-13'),
      shares: 50,
    });
    expect(result).toBe(true);
  });

  it('returns false when no matching transaction exists', async () => {
    mockFindFirstTransaction.mockResolvedValue(null);
    const result = await hasDuplicateTransaction({
      userId: 'u1',
      companyId: 'c1',
      type: 'BUY',
      date: new Date('2025-05-13'),
      shares: 50,
    });
    expect(result).toBe(false);
  });
});
