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

  // Seed categories
  const categories = [
    { categoryName: "Coffee", description: "Coffee-based drinks", sortOrder: 1 },
    { categoryName: "Tea", description: "Tea-based drinks", sortOrder: 2 },
    { categoryName: "Pastries", description: "Baked goods and pastries", sortOrder: 3 },
    { categoryName: "Sandwiches", description: "Sandwiches and wraps", sortOrder: 4 },
    { categoryName: "Rice Meals", description: "Rice-based meals", sortOrder: 5 },
    { categoryName: "Snacks", description: "Light bites and snacks", sortOrder: 6 },
    { categoryName: "Drinks", description: "Non-coffee and non-tea beverages", sortOrder: 7 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { categoryName: cat.categoryName },
      update: { description: cat.description, sortOrder: cat.sortOrder },
      create: cat,
    });
    console.log(`  ✓ Category: ${cat.categoryName}`);
  }

  // Seed ingredients (admin user for restockedBy/declaredBy/adjustedBy)
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@abbey.com" } });

  const ingredients = [
    { ingredientName: "Espresso Beans", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 1.50 },
    { ingredientName: "Milk (Fresh)", unit: "ml", initialStock: 5000, minimumThreshold: 1000, costPerUnit: 0.05 },
    { ingredientName: "Sugar", unit: "g", initialStock: 3000, minimumThreshold: 500, costPerUnit: 0.02 },
    { ingredientName: "Tea Leaves (Green)", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 2.00 },
    { ingredientName: "Tea Leaves (Black)", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 1.80 },
    { ingredientName: "Bread (Sliced)", unit: "pcs", initialStock: 30, minimumThreshold: 10, costPerUnit: 15.00 },
    { ingredientName: "Cheese", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.50 },
    { ingredientName: "Ham", unit: "g", initialStock: 800, minimumThreshold: 200, costPerUnit: 0.60 },
    { ingredientName: "Rice", unit: "g", initialStock: 5000, minimumThreshold: 1000, costPerUnit: 0.03 },
    { ingredientName: "Chicken", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.15 },
    { ingredientName: "Chocolate Syrup", unit: "ml", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.10 },
    { ingredientName: "Vanilla Syrup", unit: "ml", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.12 },
    { ingredientName: "Whipped Cream", unit: "ml", initialStock: 800, minimumThreshold: 200, costPerUnit: 0.08 },
    { ingredientName: "Flour", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.02 },
    { ingredientName: "Butter", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.30 },
    { ingredientName: "Eggs", unit: "pcs", initialStock: 30, minimumThreshold: 10, costPerUnit: 8.00 },
    { ingredientName: "Lettuce", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.10 },
    { ingredientName: "Tomato", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.08 },
    { ingredientName: "Mayonnaise", unit: "ml", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.06 },
    { ingredientName: "Caramel Syrup", unit: "ml", initialStock: 300, minimumThreshold: 50, costPerUnit: 0.15 },
  ];

  for (const ing of ingredients) {
    const existing = await prisma.ingredient.findUnique({
      where: { ingredientName: ing.ingredientName },
    });

    if (!existing) {
      const created = await prisma.ingredient.create({
        data: {
          ingredientName: ing.ingredientName,
          unit: ing.unit,
          minimumThreshold: ing.minimumThreshold,
        },
      });

      // Create a restock batch for each ingredient
      await prisma.restockBatch.create({
        data: {
          ingredientId: created.ingredientId,
          restockedById: adminUser.id,
          quantityAdded: ing.initialStock,
          quantityLeft: ing.initialStock,
          costPerUnit: ing.costPerUnit,
          totalCost: ing.initialStock * ing.costPerUnit,
          isPriority: false,
          supplierName: "Initial Stock",
          notes: "Seeded inventory",
        },
      });

      console.log(`  ✓ Ingredient: ${ing.ingredientName} (${ing.initialStock} ${ing.unit})`);
    } else {
      console.log(`  - Ingredient already exists: ${ing.ingredientName}`);
    }
  }

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
