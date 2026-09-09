import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function uuid() {
  return crypto.randomUUID();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function dateStr(d) {
  return d.toISOString().split("T")[0];
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600_000);
}

// ── Data ──────────────────────────────────────────────────

// Root categories (protected — can't be deleted or renamed)
const ROOT_CATEGORIES = [
  { categoryName: "Food", description: "Food items" },
  { categoryName: "Beverages", description: "Drinks and beverages" },
];

// Sub-categories (user-manageable)
const SUB_CATEGORIES = {
  Food: [
    { categoryName: "Pastries", description: "Baked goods and pastries" },
    { categoryName: "Sandwiches", description: "Sandwiches and wraps" },
    { categoryName: "Rice Meals", description: "Rice-based meals" },
    { categoryName: "Snacks", description: "Light bites and snacks" },
  ],
  Beverages: [
    { categoryName: "Coffee", description: "Coffee-based drinks" },
    { categoryName: "Tea", description: "Tea-based drinks" },
    { categoryName: "Drinks", description: "Non-coffee and non-tea beverages" },
  ],
};

const INGREDIENTS = [
  { ingredientName: "Espresso Beans", unit: "g", initialStock: 5000, minimumThreshold: 500, costPerUnit: 1.50 },
  { ingredientName: "Coffee Beans", unit: "g", initialStock: 3000, minimumThreshold: 500, costPerUnit: 1.20 },
  { ingredientName: "Milk (Fresh)", unit: "ml", initialStock: 15000, minimumThreshold: 2000, costPerUnit: 0.05 },
  { ingredientName: "Sugar", unit: "g", initialStock: 8000, minimumThreshold: 1000, costPerUnit: 0.02 },
  { ingredientName: "Tea Leaves (Green)", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 2.00 },
  { ingredientName: "Tea Leaves (Black)", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 1.80 },
  { ingredientName: "Bread (Sliced)", unit: "pcs", initialStock: 80, minimumThreshold: 20, costPerUnit: 15.00 },
  { ingredientName: "Cheese", unit: "g", initialStock: 3000, minimumThreshold: 500, costPerUnit: 0.50 },
  { ingredientName: "Ham", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.60 },
  { ingredientName: "Rice", unit: "g", initialStock: 15000, minimumThreshold: 2000, costPerUnit: 0.03 },
  { ingredientName: "Chicken", unit: "g", initialStock: 5000, minimumThreshold: 1000, costPerUnit: 0.15 },
  { ingredientName: "Pork", unit: "g", initialStock: 4000, minimumThreshold: 1000, costPerUnit: 0.18 },
  { ingredientName: "Chocolate Syrup", unit: "ml", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.10 },
  { ingredientName: "Vanilla Syrup", unit: "ml", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.12 },
  { ingredientName: "Whipped Cream", unit: "ml", initialStock: 1500, minimumThreshold: 300, costPerUnit: 0.08 },
  { ingredientName: "Flour", unit: "g", initialStock: 5000, minimumThreshold: 1000, costPerUnit: 0.02 },
  { ingredientName: "Butter", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.30 },
  { ingredientName: "Eggs", unit: "pcs", initialStock: 60, minimumThreshold: 20, costPerUnit: 8.00 },
  { ingredientName: "Lettuce", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.10 },
  { ingredientName: "Tomato", unit: "g", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.08 },
  { ingredientName: "Mayonnaise", unit: "ml", initialStock: 1000, minimumThreshold: 200, costPerUnit: 0.06 },
  { ingredientName: "Caramel Syrup", unit: "ml", initialStock: 800, minimumThreshold: 100, costPerUnit: 0.15 },
  { ingredientName: "Wintermelon Syrup", unit: "ml", initialStock: 800, minimumThreshold: 100, costPerUnit: 0.14 },
  { ingredientName: "Milk Tea Base", unit: "ml", initialStock: 3000, minimumThreshold: 500, costPerUnit: 0.08 },
  { ingredientName: "Blueberries", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.80 },
  { ingredientName: "Lemon", unit: "pcs", initialStock: 30, minimumThreshold: 10, costPerUnit: 12.00 },
  { ingredientName: "Bacon", unit: "g", initialStock: 1500, minimumThreshold: 300, costPerUnit: 0.70 },
  { ingredientName: "Onion", unit: "g", initialStock: 1500, minimumThreshold: 300, costPerUnit: 0.06 },
  { ingredientName: "Ice", unit: "g", initialStock: 20000, minimumThreshold: 5000, costPerUnit: 0.005 },
];

const PRODUCTS = [
  {
    productName: "Caramel Latte", categoryName: "Coffee",
    description: "Smooth espresso with caramel and steamed milk",
    variants: [
      { sizeName: "Regular", price: 130, recipes: [
        { ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 240 },
        { ingredientName: "Caramel Syrup", qty: 15 }, { ingredientName: "Sugar", qty: 8 },
      ]},
      { sizeName: "Large", price: 150, recipes: [
        { ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 360 },
        { ingredientName: "Caramel Syrup", qty: 20 }, { ingredientName: "Sugar", qty: 12 },
      ]},
    ],
  },
  {
    productName: "Americano", categoryName: "Coffee",
    description: "Bold espresso diluted with hot water",
    variants: [
      { sizeName: "Regular", price: 90, recipes: [
        { ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Sugar", qty: 5 },
      ]},
      { sizeName: "Large", price: 110, recipes: [
        { ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Sugar", qty: 8 },
      ]},
    ],
  },
  {
    productName: "Cappuccino", categoryName: "Coffee",
    description: "Espresso with thick steamed milk foam",
    variants: [
      { sizeName: "Regular", price: 120, recipes: [
        { ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 200 },
        { ingredientName: "Sugar", qty: 8 },
      ]},
      { sizeName: "Large", price: 140, recipes: [
        { ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 300 },
        { ingredientName: "Sugar", qty: 12 },
      ]},
    ],
  },
  {
    productName: "Spanish Latte", categoryName: "Coffee",
    description: "Espresso with condensed milk and steamed milk",
    variants: [
      { sizeName: "Regular", price: 140, recipes: [
        { ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 200 },
        { ingredientName: "Sugar", qty: 20 },
      ]},
      { sizeName: "Large", price: 160, recipes: [
        { ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 300 },
        { ingredientName: "Sugar", qty: 25 },
      ]},
    ],
  },
  {
    productName: "Classic Green Tea", categoryName: "Tea",
    description: "Refreshing green tea served hot or iced",
    variants: [
      { sizeName: "Regular", price: 90, recipes: [
        { ingredientName: "Tea Leaves (Green)", qty: 5 }, { ingredientName: "Sugar", qty: 10 },
      ]},
      { sizeName: "Large", price: 110, recipes: [
        { ingredientName: "Tea Leaves (Green)", qty: 8 }, { ingredientName: "Sugar", qty: 15 },
      ]},
    ],
  },
  {
    productName: "Wintermelon Milk Tea", categoryName: "Tea",
    description: "Creamy milk tea with wintermelon flavor",
    variants: [
      { sizeName: "Regular", price: 100, recipes: [
        { ingredientName: "Milk Tea Base", qty: 200 }, { ingredientName: "Wintermelon Syrup", qty: 30 },
        { ingredientName: "Sugar", qty: 15 }, { ingredientName: "Ice", qty: 100 },
      ]},
      { sizeName: "Large", price: 120, recipes: [
        { ingredientName: "Milk Tea Base", qty: 300 }, { ingredientName: "Wintermelon Syrup", qty: 40 },
        { ingredientName: "Sugar", qty: 20 }, { ingredientName: "Ice", qty: 150 },
      ]},
    ],
  },
  {
    productName: "Chocolate Croissant", categoryName: "Pastries",
    description: "Buttery croissant filled with chocolate",
    variants: [
      { sizeName: "Regular", price: 85, recipes: [
        { ingredientName: "Flour", qty: 60 }, { ingredientName: "Butter", qty: 30 },
        { ingredientName: "Eggs", qty: 1 }, { ingredientName: "Chocolate Syrup", qty: 20 },
      ]},
    ],
  },
  {
    productName: "Blueberry Muffin", categoryName: "Pastries",
    description: "Soft muffin loaded with blueberries",
    variants: [
      { sizeName: "Regular", price: 75, recipes: [
        { ingredientName: "Flour", qty: 50 }, { ingredientName: "Butter", qty: 20 },
        { ingredientName: "Eggs", qty: 1 }, { ingredientName: "Sugar", qty: 15 },
        { ingredientName: "Blueberries", qty: 25 },
      ]},
    ],
  },
  {
    productName: "Butter Croissant", categoryName: "Pastries",
    description: "Flaky golden croissant with butter",
    variants: [
      { sizeName: "Regular", price: 80, recipes: [
        { ingredientName: "Flour", qty: 60 }, { ingredientName: "Butter", qty: 35 },
        { ingredientName: "Eggs", qty: 1 },
      ]},
    ],
  },
  {
    productName: "Grilled Ham & Cheese", categoryName: "Sandwiches",
    description: "Toasted bread with ham and melted cheese",
    variants: [
      { sizeName: "Single", price: 120, recipes: [
        { ingredientName: "Bread (Sliced)", qty: 2 }, { ingredientName: "Cheese", qty: 40 },
        { ingredientName: "Ham", qty: 50 }, { ingredientName: "Butter", qty: 10 },
      ]},
      { sizeName: "Double", price: 180, recipes: [
        { ingredientName: "Bread (Sliced)", qty: 3 }, { ingredientName: "Cheese", qty: 60 },
        { ingredientName: "Ham", qty: 80 }, { ingredientName: "Butter", qty: 15 },
      ]},
    ],
  },
  {
    productName: "Chicken Club Sandwich", categoryName: "Sandwiches",
    description: "Grilled chicken with bacon, lettuce, and tomato",
    variants: [
      { sizeName: "Single", price: 140, recipes: [
        { ingredientName: "Bread (Sliced)", qty: 2 }, { ingredientName: "Chicken", qty: 80 },
        { ingredientName: "Bacon", qty: 20 }, { ingredientName: "Lettuce", qty: 15 },
        { ingredientName: "Tomato", qty: 20 }, { ingredientName: "Mayonnaise", qty: 15 },
      ]},
      { sizeName: "Double", price: 200, recipes: [
        { ingredientName: "Bread (Sliced)", qty: 3 }, { ingredientName: "Chicken", qty: 120 },
        { ingredientName: "Bacon", qty: 30 }, { ingredientName: "Lettuce", qty: 20 },
        { ingredientName: "Tomato", qty: 30 }, { ingredientName: "Mayonnaise", qty: 20 },
      ]},
    ],
  },
  {
    productName: "Chicken Adobo Rice", categoryName: "Rice Meals",
    description: "Classic Filipino chicken adobo with steamed rice",
    variants: [
      { sizeName: "Regular", price: 150, recipes: [
        { ingredientName: "Chicken", qty: 150 }, { ingredientName: "Rice", qty: 200 },
        { ingredientName: "Onion", qty: 20 },
      ]},
      { sizeName: "Large", price: 200, recipes: [
        { ingredientName: "Chicken", qty: 250 }, { ingredientName: "Rice", qty: 300 },
        { ingredientName: "Onion", qty: 30 },
      ]},
    ],
  },
  {
    productName: "Pork Sisig Rice", categoryName: "Rice Meals",
    description: "Sizzling pork sisig served over steamed rice",
    variants: [
      { sizeName: "Regular", price: 160, recipes: [
        { ingredientName: "Pork", qty: 150 }, { ingredientName: "Rice", qty: 200 },
        { ingredientName: "Onion", qty: 25 }, { ingredientName: "Eggs", qty: 1 },
      ]},
      { sizeName: "Large", price: 210, recipes: [
        { ingredientName: "Pork", qty: 250 }, { ingredientName: "Rice", qty: 300 },
        { ingredientName: "Onion", qty: 35 }, { ingredientName: "Eggs", qty: 1 },
      ]},
    ],
  },
  {
    productName: "French Fries", categoryName: "Snacks",
    description: "Crispy golden fries with seasoning",
    variants: [
      { sizeName: "Regular", price: 65, recipes: [
        { ingredientName: "Sugar", qty: 5 },
      ]},
      { sizeName: "Large", price: 90, recipes: [
        { ingredientName: "Sugar", qty: 5 },
      ]},
    ],
  },
  {
    productName: "Nachos", categoryName: "Snacks",
    description: "Crispy tortilla chips with cheese sauce",
    variants: [
      { sizeName: "Regular", price: 95, recipes: [
        { ingredientName: "Cheese", qty: 60 }, { ingredientName: "Tomato", qty: 30 },
        { ingredientName: "Mayonnaise", qty: 20 },
      ]},
    ],
  },
  {
    productName: "Fresh Lemonade", categoryName: "Drinks",
    description: "Freshly squeezed lemon with sugar and ice",
    variants: [
      { sizeName: "Regular", price: 70, recipes: [
        { ingredientName: "Lemon", qty: 1 }, { ingredientName: "Sugar", qty: 20 },
        { ingredientName: "Ice", qty: 100 },
      ]},
      { sizeName: "Large", price: 90, recipes: [
        { ingredientName: "Lemon", qty: 2 }, { ingredientName: "Sugar", qty: 30 },
        { ingredientName: "Ice", qty: 150 },
      ]},
    ],
  },
  {
    productName: "Iced Tea", categoryName: "Drinks",
    description: "Refreshing iced tea with lemon",
    variants: [
      { sizeName: "Regular", price: 50, recipes: [
        { ingredientName: "Tea Leaves (Black)", qty: 3 }, { ingredientName: "Sugar", qty: 15 },
        { ingredientName: "Ice", qty: 100 },
      ]},
      { sizeName: "Large", price: 70, recipes: [
        { ingredientName: "Tea Leaves (Black)", qty: 5 }, { ingredientName: "Sugar", qty: 20 },
        { ingredientName: "Ice", qty: 150 },
      ]},
    ],
  },
];

const CUSTOMER_NAMES = [
  "Juan Dela Cruz", "Maria Santos", "Jose Reyes", "Anna Lim", "Pedro Garcia",
  "Rose Bautista", "Mark Torres", "Joy Mendoza", "Carlo Villanueva", "Bea Fernando",
  "Daniel Ramos", "Sheila Aquino", "Ryan Castro", "Mia Gonzales", "Leo Navarro",
  "Patricia Sy", "Jerome Dizon", "Camille Tan", "Aaron Magsaysay", "Grace Padilla",
  "Rica Pembataan", "Jolo Mercado", "Bianca Salazar", "Kyle Miranda", "Faye Rodriguez",
];

const CANCELLATION_REASONS = [
  "Changed mind", "Customer left", "Out of stock", "Duplicate order",
  "Customer complaint", "Taking too long",
];

const TABLES = ["1", "2", "3", "4", "5", "6", "7", "8", "Takeout"];

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...\n");

  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    console.error("No admin user found. Run the original seed first to create users.");
    process.exit(1);
  }
  const cashierUsers = await prisma.user.findMany({ where: { role: "cashier" } });
  const kitchenUsers = await prisma.user.findMany({ where: { role: "kitchen" } });

  // ── 1. Categories ──────────────────────────────
  const catMap = {};

  // Create root categories first
  for (const cat of ROOT_CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { categoryName: cat.categoryName },
      update: { description: cat.description, parentId: null },
      create: { ...cat, parentId: null },
    });
    catMap[cat.categoryName] = created.categoryId;
  }
  console.log(`  ✓ ${ROOT_CATEGORIES.length} root categories`);

  // Create sub-categories under roots
  let subCount = 0;
  for (const [parentName, subs] of Object.entries(SUB_CATEGORIES)) {
    const parentId = catMap[parentName];
    if (!parentId) continue;
    for (const sub of subs) {
      const created = await prisma.category.upsert({
        where: { categoryName: sub.categoryName },
        update: { description: sub.description, parentId },
        create: { ...sub, parentId },
      });
      catMap[sub.categoryName] = created.categoryId;
      subCount++;
    }
  }
  console.log(`  ✓ ${subCount} sub-categories`);

  // ── 2. Ingredients ─────────────────────────────
  const ingMap = {};
  const restockData = [];
  for (const ing of INGREDIENTS) {
    const created = await prisma.ingredient.create({
      data: {
        ingredientName: ing.ingredientName,
        unit: ing.unit,
        minimumThreshold: ing.minimumThreshold,
      },
    });
    ingMap[ing.ingredientName] = created.ingredientId;
    restockData.push({ ...ing, ingredientId: created.ingredientId });
  }
  console.log(`  ✓ ${INGREDIENTS.length} ingredients`);

  // ── 3. Products + Variants + Recipes ───────────
  const variantMap = []; // { variantId, productId, sizeName, price, productName }
  for (const prod of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        productName: prod.productName,
        categoryId: catMap[prod.categoryName],
        description: prod.description,
      },
    });

    for (const v of prod.variants) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.productId,
          sizeName: v.sizeName,
          price: v.price,
          recipes: {
            create: v.recipes.map((r) => ({
              ingredientId: ingMap[r.ingredientName],
              quantityNeeded: r.qty,
            })),
          },
        },
      });
      variantMap.push({
        variantId: variant.variantId,
        productId: product.productId,
        sizeName: v.sizeName,
        price: v.price,
        productName: prod.productName,
        categoryName: prod.categoryName,
      });
    }
  }
  const totalVariants = variantMap.length;
  const totalRecipes = PRODUCTS.reduce((sum, p) =>
    sum + p.variants.reduce((s, v) => s + v.recipes.length, 0), 0);
  console.log(`  ✓ ${PRODUCTS.length} products, ${totalVariants} variants, ${totalRecipes} recipes`);

  // ── 4. Restock Batches (initial stock) ─────────
  for (const r of restockData) {
    await prisma.restockBatch.create({
      data: {
        ingredientId: r.ingredientId,
        restockedById: adminUser.id,
        quantityAdded: r.initialStock,
        quantityLeft: r.initialStock,
        costPerUnit: r.costPerUnit,
        totalCost: Math.round(r.initialStock * r.costPerUnit * 100) / 100,
        isPriority: false,
        supplierName: "Initial Stock",
        notes: "Seeded inventory",
      },
    });
  }
  console.log(`  ✓ ${restockData.length} restock batches (initial stock)`);

  // ── 5. Generate Orders ─────────────────────────
  const now = new Date();
  const DAY_MS = 86400_000;
  const TOTAL_DAYS = 30;
  const orderRecords = [];
  const orderItemRecords = [];
  let orderCounter = 0;

  // Build weight maps by category for time-of-day
  const coffeeVariants = variantMap.filter(v => v.categoryName === "Coffee");
  const teaVariants = variantMap.filter(v => v.categoryName === "Tea");
  const pastryVariants = variantMap.filter(v => v.categoryName === "Pastries");
  const sandwichVariants = variantMap.filter(v => v.categoryName === "Sandwiches");
  const riceVariants = variantMap.filter(v => v.categoryName === "Rice Meals");
  const snackVariants = variantMap.filter(v => v.categoryName === "Snacks");
  const drinkVariants = variantMap.filter(v => v.categoryName === "Drinks");

  // Product associations: what to suggest when ordering X
  const PAIRINGS = {
    "Coffee": [...pastryVariants, ...pastryVariants],     // pastry 2x weight
    "Sandwiches": [...drinkVariants, ...drinkVariants],
    "Rice Meals": [...drinkVariants, ...drinkVariants],
    "Snacks": [...drinkVariants, ...drinkVariants, ...coffeeVariants],
    "Tea": [...pastryVariants],
    "Pastries": [...coffeeVariants, ...teaVariants],
    "Drinks": [],
  };

  for (let dayOffset = TOTAL_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = new Date(now.getTime() - dayOffset * DAY_MS);
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Orders per day: weekday 6-10, weekend 10-14
    const ordersToday = isWeekend ? randInt(10, 14) : randInt(6, 10);

    // Generate time slots for the day
    const timeSlots = [];
    for (let i = 0; i < ordersToday; i++) {
      // Weighted towards lunch (11-13) and morning (7-10)
      const hour = pickWeighted(
        [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
        [3, 5, 5, 4, 8, 10, 8, 4, 4, 3, 2, 2]
      );
      const minute = randInt(0, 59);
      timeSlots.push({ hour, minute });
    }
    timeSlots.sort((a, b) => a.hour - b.hour || a.minute - b.minute);

    for (const slot of timeSlots) {
      orderCounter++;
      const orderId = uuid();
      const orderDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const createdAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), slot.hour, slot.minute);

      // Pick primary category based on time
      let primaryCategory;
      if (slot.hour >= 7 && slot.hour <= 10) {
        primaryCategory = pickWeighted(["Coffee", "Pastries"], [6, 4]);
      } else if (slot.hour >= 11 && slot.hour <= 13) {
        primaryCategory = pickWeighted(["Rice Meals", "Sandwiches"], [6, 4]);
      } else if (slot.hour >= 14 && slot.hour <= 17) {
        primaryCategory = pickWeighted(["Snacks", "Tea", "Pastries", "Coffee"], [3, 2, 3, 2]);
      } else {
        primaryCategory = pickWeighted(["Drinks", "Snacks"], [5, 5]);
      }

      // How many items: 1-4
      const itemCount = pickWeighted([1, 2, 3, 4], [40, 35, 20, 5]);

      // Pick primary variant
      const primaryVariants = variantMap.filter(v => v.categoryName === primaryCategory);
      const pickedVariants = [pick(primaryVariants)];

      // Pick additional items (pairings)
      if (itemCount > 1) {
        const pairingPool = PAIRINGS[primaryCategory] || [];
        if (pairingPool.length > 0) {
          for (let i = 1; i < itemCount; i++) {
            const pool = pairingPool.filter(p => !pickedVariants.find(pv => pv.variantId === p.variantId));
            if (pool.length > 0) {
              pickedVariants.push(pick(pool));
            } else {
              pickedVariants.push(pick(variantMap));
            }
          }
        } else {
          for (let i = 1; i < itemCount; i++) {
            pickedVariants.push(pick(variantMap));
          }
        }
      }

      // Build order items
      let totalAmount = 0;
      const items = [];
      for (const v of pickedVariants) {
        const qty = v.categoryName === "Rice Meals" || v.categoryName === "Sandwiches" ? 1 : randInt(1, 2);
        const subtotal = Number(v.price) * qty;
        totalAmount += subtotal;
        items.push({
          productId: v.productId,
          variantId: v.variantId,
          quantity: qty,
          unitPrice: v.price,
          subtotal,
        });
      }
      totalAmount = Math.round(totalAmount * 100) / 100;

      // Status: 85% completed, 15% cancelled
      const isCancelled = Math.random() < 0.15;
      const status = isCancelled ? "cancelled" : "completed";

      // Status timestamps
      const acceptedAt = new Date(createdAt.getTime() + randInt(30, 120) * 1000);
      const processingAt = new Date(acceptedAt.getTime() + randInt(60, 300) * 1000);
      const completedAt = isCancelled
        ? null
        : new Date(processingAt.getTime() + randInt(120, 600) * 1000);
      const nextInLineAt = new Date(acceptedAt.getTime() + randInt(10, 60) * 1000);

      const cashier = pick(cashierUsers);
      const kitchen = pick(kitchenUsers);

      orderRecords.push({
        orderId,
        orderNumber: orderCounter,
        orderDate,
        customerName: pick(CUSTOMER_NAMES),
        tableNumber: pick(TABLES),
        orderSource: Math.random() < 0.85 ? "walk_in" : "online",
        status,
        acceptedAt,
        acceptedBy: cashier.id,
        nextInLineAt,
        nextInLineBy: cashier.id,
        processingAt,
        processingBy: kitchen.id,
        completedAt,
        completedBy: isCancelled ? null : kitchen.id,
        totalAmount,
        amountPaid: isCancelled ? null : totalAmount,
        change: isCancelled ? null : 0,
        createdAt,
        createdBy: cashier.id,
      });

      for (const item of items) {
        orderItemRecords.push({
          orderId,
          ...item,
        });
      }
    }
  }

  // Bulk insert orders
  await prisma.order.createMany({ data: orderRecords });
  console.log(`  ✓ ${orderRecords.length} orders over ${TOTAL_DAYS} days`);

  // Bulk insert order items
  await prisma.orderItem.createMany({ data: orderItemRecords });
  console.log(`  ✓ ${orderItemRecords.length} order items`);

  // Create cancellations + receipts
  const cancelledOrders = orderRecords.filter(o => o.status === "cancelled");
  const completedOrders = orderRecords.filter(o => o.status === "completed");

  if (cancelledOrders.length > 0) {
    await prisma.orderCancellation.createMany({
      data: cancelledOrders.map(o => ({
        orderId: o.orderId,
        cancelledBy: o.createdBy,
        reason: pick(CANCELLATION_REASONS),
        cancelledAt: o.acceptedAt || new Date(),
      })),
    });
    console.log(`  ✓ ${cancelledOrders.length} cancellations`);
  }

  if (completedOrders.length > 0) {
    await prisma.receipt.createMany({
      data: completedOrders.map(o => ({
        receiptId: uuid(),
        orderId: o.orderId,
        issuedBy: o.completedBy,
        totalAmount: o.totalAmount,
        issuedAt: o.completedAt,
      })),
    });
    console.log(`  ✓ ${completedOrders.length} receipts`);
  }

  // Order counters
  const dateCounters = {};
  for (const o of orderRecords) {
    const key = dateStr(o.orderDate);
    dateCounters[key] = (dateCounters[key] || 0) + 1;
  }
  await prisma.orderCounter.createMany({
    data: Object.entries(dateCounters).map(([date, counter]) => ({
      date: new Date(date),
      counter,
    })),
  });
  console.log(`  ✓ ${Object.keys(dateCounters).length} order counters`);

  // ── 6. Additional restock batches (mid-period) ─
  const additionalRestocks = [];
  for (const ing of INGREDIENTS) {
    // 2-3 restocks per ingredient, spread across the 30 days
    const numRestocks = randInt(2, 3);
    for (let i = 0; i < numRestocks; i++) {
      const dayOffset = randInt(3, 25);
      const qty = Math.round(ing.initialStock * randInt(30, 60) / 100);
      additionalRestocks.push({
        ingredientId: ingMap[ing.ingredientName],
        restockedById: adminUser.id,
        quantityAdded: qty,
        quantityLeft: qty,
        costPerUnit: ing.costPerUnit,
        totalCost: Math.round(qty * ing.costPerUnit * 100) / 100,
        isPriority: Math.random() < 0.2,
        supplierName: pick(["Supplier A", "Supplier B", "Supplier C"]),
        notes: `Restock day ${dayOffset}`,
        restockedAt: new Date(now.getTime() - dayOffset * DAY_MS + randInt(8, 16) * 3600_000),
      });
    }
  }
  await prisma.restockBatch.createMany({ data: additionalRestocks });
  console.log(`  ✓ ${additionalRestocks.length} additional restock batches`);

  console.log("\n── Summary ──");
  console.log(`  Categories:    ${CATEGORIES.length}`);
  console.log(`  Ingredients:   ${INGREDIENTS.length}`);
  console.log(`  Products:      ${PRODUCTS.length}`);
  console.log(`  Variants:      ${totalVariants}`);
  console.log(`  Recipes:       ${totalRecipes}`);
  console.log(`  Orders:        ${orderRecords.length}`);
  console.log(`  Order Items:   ${orderItemRecords.length}`);
  console.log(`  Completed:     ${completedOrders.length}`);
  console.log(`  Cancelled:     ${cancelledOrders.length}`);
  console.log(`  Restock Batches: ${restockData.length + additionalRestocks.length}`);
  console.log("\nSeed complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
