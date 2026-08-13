import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

const users = [
  {
    name: "Abbey Admin",
    email: "admin@abbey.com",
    role: "admin",
    password: "admin123",
    pin: "1234",
  },
  {
    name: "Juan Santos",
    email: "juan@abbey.com",
    role: "cashier",
    password: null,
    pin: "1111",
  },
  {
    name: "Maria Cruz",
    email: "maria@abbey.com",
    role: "cashier",
    password: null,
    pin: "2222",
  },
  {
    name: "Jose Reyes",
    email: "jose@abbey.com",
    role: "cashier",
    password: null,
    pin: "3333",
  },
  {
    name: "Ana Dela Cruz",
    email: "ana@abbey.com",
    role: "kitchen",
    password: null,
    pin: "4444",
  },
  {
    name: "Carlo Garcia",
    email: "carlo@abbey.com",
    role: "kitchen",
    password: null,
    pin: "5555",
  },
];

async function main() {
  console.log("Seeding database...\n");

  // Hash all passwords and PINs upfront
  const adminPasswordHash = await bcrypt.hash("admin123", SALT_ROUNDS);

  const pinHashes = {};
  for (const user of users) {
    if (user.pin) {
      pinHashes[user.email] = await bcrypt.hash(user.pin, SALT_ROUNDS);
    }
  }

  // Seed users
  for (const user of users) {
    const passwordHash = user.password
      ? await bcrypt.hash(user.password, SALT_ROUNDS)
      : null;
    const pinHash = pinHashes[user.email] || null;

    const result = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        passwordHash: passwordHash || adminPasswordHash,
        pinHash,
        isActive: true,
        mustChangePwd: false,
      },
    });

    console.log(`  ✓ ${result.name} (${result.role}) — ${result.email}`);
  }

  // Seed system settings
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: "Abbey's Kitchenette",
      storeAddress: "Robledo Compound, Bulacnin, Lipa City",
      storePhone: "0929 781 1212",
      storeEmail: "maryrosemendoza78@yahoo.com",
      storeIpWhitelist: "127.0.0.1",
      currency: "PHP",
      taxRate: 0,
    },
  });

  console.log("\n  ✓ SystemSettings seeded");

  console.log("\nSeeding complete!");
  console.log("\n--- Login Credentials ---");
  console.log("Admin:   admin@abbey.com / admin123");
  console.log("Cashier: Juan Santos  → PIN 1111");
  console.log("Cashier: Maria Cruz   → PIN 2222");
  console.log("Cashier: Jose Reyes   → PIN 3333");
  console.log("Kitchen: Ana Dela Cruz → PIN 4444");
  console.log("Kitchen: Carlo Garcia → PIN 5555");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
