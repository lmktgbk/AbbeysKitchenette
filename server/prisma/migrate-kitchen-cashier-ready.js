import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Step 1: Add kitchen_ready column to orders...');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "kitchen_ready" BOOLEAN NOT NULL DEFAULT false`
  );
  console.log('   Done');

  console.log('Step 2: Add cashier_ready column to orders...');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cashier_ready" BOOLEAN NOT NULL DEFAULT false`
  );
  console.log('   Done');

  console.log('Migration complete! Added kitchen_ready and cashier_ready columns.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
