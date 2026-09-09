import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Step 1: Add preparing to enum...');
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'preparing'; EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  );
  console.log('   Done');

  console.log('Step 2: Update statuses from next_in_line/processing to preparing...');
  await prisma.$executeRawUnsafe(
    `UPDATE "orders" SET status = 'preparing' WHERE status IN ('next_in_line', 'processing')`
  );
  console.log('   Done');

  console.log('Step 3: Create preparing_at/preparing_by columns and copy data...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "preparing_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "preparing_by" UUID
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "orders"
    SET preparing_at = COALESCE(next_in_line_at, processing_at),
        preparing_by = COALESCE(next_in_line_by, processing_by)
    WHERE preparing_at IS NULL AND (next_in_line_at IS NOT NULL OR processing_at IS NOT NULL)
  `);
  console.log('   Done');

  console.log('Step 4: Add is_prepared column to order_items...');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "is_prepared" BOOLEAN NOT NULL DEFAULT false`
  );
  console.log('   Done');

  console.log('Step 5: Add loss override columns...');
  const overrideCols = [
    `ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "related_order_id" UUID`,
    `ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "related_order_item_id" INTEGER`,
    `DO $$ BEGIN ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "override_reason" loss_override_reason_enum; EXCEPTION WHEN undefined_object THEN
      CREATE TYPE loss_override_reason_enum AS ENUM ('transferred','not_used','other');
      ALTER TABLE "loss_records" ADD COLUMN "override_reason" loss_override_reason_enum;
    END $$`,
    `ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "override_note" VARCHAR(500)`,
    `ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "overridden_by" UUID`,
    `ALTER TABLE "loss_records" ADD COLUMN IF NOT EXISTS "overridden_at" TIMESTAMPTZ`,
  ];
  for (const sql of overrideCols) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log('   Done');

  console.log('Step 6: Drop old columns and enum values...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "next_in_line_at"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "next_in_line_by"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "processing_at"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "processing_by"`);
  console.log('   Old columns dropped');

  console.log('Migration complete!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
