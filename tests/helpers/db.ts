import { prisma } from "@/lib/prisma";

export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("trades_test")) {
    throw new Error(
      `resetDb() refused to run: DATABASE_URL does not look like the test database (${url}). ` +
        `Make sure .env.test is loaded before running tests.`,
    );
  }

  await prisma.transaction.deleteMany();
  await prisma.company.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
}
