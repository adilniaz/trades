import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin account");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    // Re-seeding restores the ADMIN role (in case it was accidentally demoted)
    // but intentionally does NOT overwrite the password hash — an admin may
    // have changed their password since the initial seed.
    update: { role: "ADMIN" },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  await prisma.setting.upsert({
    where: { key: "transactionFee" },
    update: {},
    create: { key: "transactionFee", value: "1" },
  });

  // Display-only label — see the Global Constraints' single-currency
  // assumption note. Does not enable multi-currency support or conversion.
  await prisma.setting.upsert({
    where: { key: "displayCurrency" },
    update: {},
    create: { key: "displayCurrency", value: "USD" },
  });

  console.log(`Seeded admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
