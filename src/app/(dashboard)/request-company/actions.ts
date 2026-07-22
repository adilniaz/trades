'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { companyRequestSchema } from '@/lib/validation/company-request';

export async function requestCompany(input: unknown) {
  const user = await requireAuth({ roles: ['USER'] });
  const parsed = companyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;
  try {
    await prisma.company.create({
      data: {
        name: data.name,
        ticker: data.ticker,
        isin: data.isin ?? undefined,
        nonCompliantPct: 0,
        status: 'PENDING',
        requestedById: user.id,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return { error: 'A company with this ticker or ISIN already exists' };
    }
    throw e;
  }
  revalidatePath('/admin/companies');
  return { success: true };
}
