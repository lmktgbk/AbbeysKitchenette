import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function uuid() { return crypto.randomUUID(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function dateStr(d) { return d.toISOString().split("T")[0]; }
function addDays(d, days) { const r = new Date(d); r.setDate(r.getDate() + days); return r; }
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }

// ── Hardcoded User IDs ──
const ADMIN_ID = "8b61ffe2-0ff4-43ed-8878-8a4fda1ec086";
const CASHIER_IDS = [
  "8afe4c42-2b5b-44d1-810f-b21d2ec8ed80",
  "3e71dfdb-fb87-4179-8b5c-f6b6bfed2928",
];
const KITCHEN_ID = "12aa2a06-a7ac-4fc9-9447-5ad0c157977a";

// ── Ingredients ──
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
  { ingredientName: "Potato Fries", unit: "g", initialStock: 4000, minimumThreshold: 800, costPerUnit: 0.08 },
  { ingredientName: "Nacho Chips", unit: "g", initialStock: 2000, minimumThreshold: 400, costPerUnit: 0.12 },
  { ingredientName: "Tuna", unit: "g", initialStock: 2000, minimumThreshold: 400, costPerUnit: 0.25 },
  { ingredientName: "Hazelnut Syrup", unit: "ml", initialStock: 800, minimumThreshold: 100, costPerUnit: 0.18 },
  { ingredientName: "Jasmine Tea Base", unit: "ml", initialStock: 2000, minimumThreshold: 400, costPerUnit: 0.07 },
];

// ── Products ──
// subcategoryId assigned dynamically after subcategories are created
const PRODUCTS = [
  // Coffee
  { productName: "Caramel Latte", subcategoryKey: "Coffee", description: "Smooth espresso with caramel and steamed milk", variants: [
    { sizeName: "Regular", price: 130, recipes: [{ ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 240 }, { ingredientName: "Caramel Syrup", qty: 15 }, { ingredientName: "Sugar", qty: 10 }] },
    { sizeName: "Large", price: 150, recipes: [{ ingredientName: "Espresso Beans", qty: 22 }, { ingredientName: "Milk (Fresh)", qty: 350 }, { ingredientName: "Caramel Syrup", qty: 20 }, { ingredientName: "Sugar", qty: 15 }] },
  ]},
  { productName: "Americano", subcategoryKey: "Coffee", description: "Bold espresso with hot water", variants: [
    { sizeName: "Regular", price: 90, recipes: [{ ingredientName: "Espresso Beans", qty: 20 }, { ingredientName: "Sugar", qty: 5 }] },
    { sizeName: "Large", price: 110, recipes: [{ ingredientName: "Espresso Beans", qty: 28 }, { ingredientName: "Sugar", qty: 8 }] },
  ]},
  { productName: "Cappuccino", subcategoryKey: "Coffee", description: "Espresso with thick milk foam", variants: [
    { sizeName: "Regular", price: 120, recipes: [{ ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 200 }, { ingredientName: "Sugar", qty: 10 }] },
    { sizeName: "Large", price: 140, recipes: [{ ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 300 }, { ingredientName: "Sugar", qty: 12 }] },
  ]},
  { productName: "Spanish Latte", subcategoryKey: "Coffee", description: "Creamy espresso with condensed milk", variants: [
    { sizeName: "Regular", price: 140, recipes: [{ ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 200 }, { ingredientName: "Sugar", qty: 20 }] },
    { sizeName: "Large", price: 160, recipes: [{ ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 300 }, { ingredientName: "Sugar", qty: 25 }] },
  ]},
  { productName: "Mocha", subcategoryKey: "Coffee", description: "Espresso with chocolate and steamed milk", variants: [
    { sizeName: "Regular", price: 135, recipes: [{ ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 240 }, { ingredientName: "Chocolate Syrup", qty: 20 }, { ingredientName: "Sugar", qty: 10 }] },
    { sizeName: "Large", price: 155, recipes: [{ ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 350 }, { ingredientName: "Chocolate Syrup", qty: 25 }, { ingredientName: "Sugar", qty: 12 }] },
  ]},
  { productName: "Hazelnut Latte", subcategoryKey: "Coffee", description: "Espresso with hazelnut flavor", variants: [
    { sizeName: "Regular", price: 140, recipes: [{ ingredientName: "Espresso Beans", qty: 18 }, { ingredientName: "Milk (Fresh)", qty: 240 }, { ingredientName: "Hazelnut Syrup", qty: 15 }, { ingredientName: "Sugar", qty: 10 }] },
    { sizeName: "Large", price: 160, recipes: [{ ingredientName: "Espresso Beans", qty: 24 }, { ingredientName: "Milk (Fresh)", qty: 350 }, { ingredientName: "Hazelnut Syrup", qty: 20 }, { ingredientName: "Sugar", qty: 12 }] },
  ]},
  // Tea
  { productName: "Classic Green Tea", subcategoryKey: "Tea", description: "Refreshing green tea", variants: [
    { sizeName: "Regular", price: 90, recipes: [{ ingredientName: "Tea Leaves (Green)", qty: 3 }, { ingredientName: "Sugar", qty: 10 }, { ingredientName: "Ice", qty: 80 }] },
    { sizeName: "Large", price: 110, recipes: [{ ingredientName: "Tea Leaves (Green)", qty: 5 }, { ingredientName: "Sugar", qty: 15 }, { ingredientName: "Ice", qty: 120 }] },
  ]},
  { productName: "Wintermelon Milk Tea", subcategoryKey: "Tea", description: "Creamy wintermelon milk tea", variants: [
    { sizeName: "Regular", price: 100, recipes: [{ ingredientName: "Wintermelon Syrup", qty: 30 }, { ingredientName: "Milk Tea Base", qty: 200 }, { ingredientName: "Sugar", qty: 15 }, { ingredientName: "Ice", qty: 80 }] },
    { sizeName: "Large", price: 120, recipes: [{ ingredientName: "Wintermelon Syrup", qty: 40 }, { ingredientName: "Milk Tea Base", qty: 300 }, { ingredientName: "Sugar", qty: 20 }, { ingredientName: "Ice", qty: 120 }] },
  ]},
  { productName: "Jasmine Milk Tea", subcategoryKey: "Tea", description: "Fragrant jasmine milk tea", variants: [
    { sizeName: "Regular", price: 100, recipes: [{ ingredientName: "Jasmine Tea Base", qty: 200 }, { ingredientName: "Milk Tea Base", qty: 100 }, { ingredientName: "Sugar", qty: 15 }, { ingredientName: "Ice", qty: 80 }] },
    { sizeName: "Large", price: 120, recipes: [{ ingredientName: "Jasmine Tea Base", qty: 300 }, { ingredientName: "Milk Tea Base", qty: 150 }, { ingredientName: "Sugar", qty: 20 }, { ingredientName: "Ice", qty: 120 }] },
  ]},
  // Cold Drinks
  { productName: "Fresh Lemonade", subcategoryKey: "Cold Drinks", description: "Freshly squeezed lemonade", variants: [
    { sizeName: "Regular", price: 70, recipes: [{ ingredientName: "Lemon", qty: 1 }, { ingredientName: "Sugar", qty: 20 }, { ingredientName: "Ice", qty: 100 }] },
    { sizeName: "Large", price: 90, recipes: [{ ingredientName: "Lemon", qty: 1.5 }, { ingredientName: "Sugar", qty: 30 }, { ingredientName: "Ice", qty: 150 }] },
  ]},
  { productName: "Iced Tea", subcategoryKey: "Cold Drinks", description: "Refreshing iced tea with lemon", variants: [
    { sizeName: "Regular", price: 50, recipes: [{ ingredientName: "Tea Leaves (Black)", qty: 3 }, { ingredientName: "Sugar", qty: 15 }, { ingredientName: "Ice", qty: 100 }] },
    { sizeName: "Large", price: 70, recipes: [{ ingredientName: "Tea Leaves (Black)", qty: 5 }, { ingredientName: "Sugar", qty: 20 }, { ingredientName: "Ice", qty: 150 }] },
  ]},
  { productName: "Iced Chocolate", subcategoryKey: "Cold Drinks", description: "Rich chocolate over ice", variants: [
    { sizeName: "Regular", price: 95, recipes: [{ ingredientName: "Chocolate Syrup", qty: 30 }, { ingredientName: "Milk (Fresh)", qty: 150 }, { ingredientName: "Whipped Cream", qty: 30 }, { ingredientName: "Ice", qty: 100 }] },
    { sizeName: "Large", price: 115, recipes: [{ ingredientName: "Chocolate Syrup", qty: 40 }, { ingredientName: "Milk (Fresh)", qty: 250 }, { ingredientName: "Whipped Cream", qty: 40 }, { ingredientName: "Ice", qty: 150 }] },
  ]},
  // Pastries
  { productName: "Chocolate Croissant", subcategoryKey: "Pastries", description: "Flaky croissant with chocolate filling", variants: [
    { sizeName: "Regular", price: 85, recipes: [{ ingredientName: "Flour", qty: 60 }, { ingredientName: "Butter", qty: 25 }, { ingredientName: "Chocolate Syrup", qty: 20 }, { ingredientName: "Eggs", qty: 0.5 }] },
  ]},
  { productName: "Blueberry Muffin", subcategoryKey: "Pastries", description: "Soft muffin with blueberries", variants: [
    { sizeName: "Regular", price: 75, recipes: [{ ingredientName: "Flour", qty: 50 }, { ingredientName: "Butter", qty: 15 }, { ingredientName: "Blueberries", qty: 20 }, { ingredientName: "Eggs", qty: 0.5 }, { ingredientName: "Sugar", qty: 15 }] },
  ]},
  { productName: "Butter Croissant", subcategoryKey: "Pastries", description: "Classic buttery croissant", variants: [
    { sizeName: "Regular", price: 80, recipes: [{ ingredientName: "Flour", qty: 60 }, { ingredientName: "Butter", qty: 30 }, { ingredientName: "Eggs", qty: 0.5 }] },
  ]},
  // Sandwiches
  { productName: "Grilled Ham & Cheese", subcategoryKey: "Sandwiches", description: "Toasted sandwich with ham and cheese", variants: [
    { sizeName: "Single", price: 120, recipes: [{ ingredientName: "Bread (Sliced)", qty: 2 }, { ingredientName: "Ham", qty: 40 }, { ingredientName: "Cheese", qty: 30 }, { ingredientName: "Butter", qty: 10 }] },
    { sizeName: "Double", price: 180, recipes: [{ ingredientName: "Bread (Sliced)", qty: 3 }, { ingredientName: "Ham", qty: 70 }, { ingredientName: "Cheese", qty: 50 }, { ingredientName: "Butter", qty: 15 }] },
  ]},
  { productName: "Chicken Club Sandwich", subcategoryKey: "Sandwiches", description: "Triple-decker with chicken, bacon, lettuce", variants: [
    { sizeName: "Single", price: 140, recipes: [{ ingredientName: "Bread (Sliced)", qty: 3 }, { ingredientName: "Chicken", qty: 60 }, { ingredientName: "Bacon", qty: 20 }, { ingredientName: "Lettuce", qty: 15 }, { ingredientName: "Tomato", qty: 20 }, { ingredientName: "Mayonnaise", qty: 15 }] },
    { sizeName: "Double", price: 200, recipes: [{ ingredientName: "Bread (Sliced)", qty: 4 }, { ingredientName: "Chicken", qty: 100 }, { ingredientName: "Bacon", qty: 30 }, { ingredientName: "Lettuce", qty: 20 }, { ingredientName: "Tomato", qty: 30 }, { ingredientName: "Mayonnaise", qty: 20 }] },
  ]},
  { productName: "Tuna Melt", subcategoryKey: "Sandwiches", description: "Toasted sandwich with tuna and melted cheese", variants: [
    { sizeName: "Single", price: 130, recipes: [{ ingredientName: "Bread (Sliced)", qty: 2 }, { ingredientName: "Tuna", qty: 60 }, { ingredientName: "Cheese", qty: 30 }, { ingredientName: "Mayonnaise", qty: 15 }, { ingredientName: "Onion", qty: 10 }] },
    { sizeName: "Double", price: 190, recipes: [{ ingredientName: "Bread (Sliced)", qty: 3 }, { ingredientName: "Tuna", qty: 100 }, { ingredientName: "Cheese", qty: 50 }, { ingredientName: "Mayonnaise", qty: 20 }, { ingredientName: "Onion", qty: 15 }] },
  ]},
  // Rice Meals
  { productName: "Chicken Adobo Rice", subcategoryKey: "Rice Meals", description: "Classic chicken adobo with steamed rice", variants: [
    { sizeName: "Regular", price: 150, recipes: [{ ingredientName: "Chicken", qty: 120 }, { ingredientName: "Rice", qty: 150 }, { ingredientName: "Onion", qty: 20 }, { ingredientName: "Eggs", qty: 1 }] },
    { sizeName: "Large", price: 200, recipes: [{ ingredientName: "Chicken", qty: 180 }, { ingredientName: "Rice", qty: 250 }, { ingredientName: "Onion", qty: 30 }, { ingredientName: "Eggs", qty: 1 }] },
  ]},
  { productName: "Pork Sisig Rice", subcategoryKey: "Rice Meals", description: "Sizzling pork sisig with rice", variants: [
    { sizeName: "Regular", price: 160, recipes: [{ ingredientName: "Pork", qty: 120 }, { ingredientName: "Rice", qty: 150 }, { ingredientName: "Onion", qty: 30 }, { ingredientName: "Eggs", qty: 1 }, { ingredientName: "Mayonnaise", qty: 15 }] },
    { sizeName: "Large", price: 210, recipes: [{ ingredientName: "Pork", qty: 180 }, { ingredientName: "Rice", qty: 250 }, { ingredientName: "Onion", qty: 40 }, { ingredientName: "Eggs", qty: 1 }, { ingredientName: "Mayonnaise", qty: 20 }] },
  ]},
  // Snacks
  { productName: "French Fries", subcategoryKey: "Snacks", description: "Crispy golden fries", variants: [
    { sizeName: "Regular", price: 65, recipes: [{ ingredientName: "Potato Fries", qty: 120 }, { ingredientName: "Salt", qty: 2 }] },
    { sizeName: "Large", price: 90, recipes: [{ ingredientName: "Potato Fries", qty: 200 }, { ingredientName: "Salt", qty: 3 }] },
  ]},
  { productName: "Nachos", subcategoryKey: "Snacks", description: "Crispy nachos with cheese dip", variants: [
    { sizeName: "Regular", price: 95, recipes: [{ ingredientName: "Nacho Chips", qty: 100 }, { ingredientName: "Cheese", qty: 40 }, { ingredientName: "Jalapeño", qty: 10 }] },
  ]},
];

// Add Salt and Jalapeño to ingredients
INGREDIENTS.push(
  { ingredientName: "Salt", unit: "g", initialStock: 2000, minimumThreshold: 500, costPerUnit: 0.01 },
  { ingredientName: "Jalapeño", unit: "g", initialStock: 500, minimumThreshold: 100, costPerUnit: 0.15 },
);

// ── Static Data ──
const SUBCATEGORY_DATA = {
  Food: [
    { subcategoryName: "Pastries", description: "Baked goods and pastries" },
    { subcategoryName: "Sandwiches", description: "Sandwiches and wraps" },
    { subcategoryName: "Rice Meals", description: "Rice-based meals" },
    { subcategoryName: "Snacks", description: "Light bites and snacks" },
  ],
  Beverages: [
    { subcategoryName: "Coffee", description: "Coffee-based drinks" },
    { subcategoryName: "Tea", description: "Tea-based drinks" },
    { subcategoryName: "Cold Drinks", description: "Non-coffee and non-tea beverages" },
  ],
};

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
  const startTime = Date.now();
  console.log("Seeding 2-year dataset...\n");

  // ── Phase 1: Categories & Subcategories ──
  console.log("Phase 1: Categories & Subcategories");

  // Use existing root categories
  const rootCategories = await prisma.category.findMany();
  const catMap = {};
  for (const cat of rootCategories) {
    catMap[cat.categoryName] = cat.categoryId;
  }
  console.log(`  ✓ ${rootCategories.length} root categories (existing)`);

  // Create subcategories
  const subMap = {};
  for (const [parentName, subs] of Object.entries(SUBCATEGORY_DATA)) {
    const parentId = catMap[parentName];
    if (!parentId) continue;
    for (const sub of subs) {
      const created = await prisma.subcategory.upsert({
        where: { categoryId_subcategoryName: { categoryId: parentId, subcategoryName: sub.subcategoryName } },
        update: { description: sub.description },
        create: { categoryId: parentId, subcategoryName: sub.subcategoryName, description: sub.description },
      });
      subMap[sub.subcategoryName] = created.subcategoryId;
    }
  }
  console.log(`  ✓ ${Object.keys(subMap).length} subcategories`);

  // ── Phase 2: Ingredients ──
  console.log("\nPhase 2: Ingredients");

  const ingMap = {}; // ingredientName -> { id, initialStock, costPerUnit }
  for (const ing of INGREDIENTS) {
    const created = await prisma.ingredient.create({
      data: {
        ingredientName: ing.ingredientName,
        unit: ing.unit,
        minimumThreshold: ing.minimumThreshold,
      },
    });
    ingMap[ing.ingredientName] = { id: created.ingredientId, initialStock: ing.initialStock, costPerUnit: ing.costPerUnit };
  }
  console.log(`  ✓ ${INGREDIENTS.length} ingredients`);

  // ── Phase 3: Products + Variants + Recipes ──
  console.log("\nPhase 3: Products + Variants + Recipes");

  const variantMap = []; // { variantId, productId, sizeName, price, productName, subcategoryKey }
  let totalRecipes = 0;

  for (const prod of PRODUCTS) {
    const subcategoryId = subMap[prod.subcategoryKey];
    if (!subcategoryId) {
      console.error(`  ✗ Subcategory not found: ${prod.subcategoryKey}`);
      continue;
    }

    const product = await prisma.product.create({
      data: {
        productName: prod.productName,
        subcategoryId,
        description: prod.description,
      },
    });

    for (const v of prod.variants) {
      const recipeData = v.recipes.map((r) => ({
        ingredientId: ingMap[r.ingredientName].id,
        quantityNeeded: r.qty,
      }));

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.productId,
          sizeName: v.sizeName,
          price: v.price,
          recipes: { create: recipeData },
        },
      });

      variantMap.push({
        variantId: variant.variantId,
        productId: product.productId,
        sizeName: v.sizeName,
        price: v.price,
        productName: prod.productName,
        subcategoryKey: prod.subcategoryKey,
      });
      totalRecipes += recipeData.length;
    }
  }
  console.log(`  ✓ ${PRODUCTS.length} products, ${variantMap.length} variants, ${totalRecipes} recipes`);

  // ── Phase 4: Initial Restock Batches ──
  console.log("\nPhase 4: Initial Restock Batches");

  const now = new Date();
  const SEED_START = new Date("2024-09-16T00:00:00Z");
  const DAY_MS = 86400_000;
  const TOTAL_DAYS = 730;

  // Create all restock batches upfront (we'll track them in memory for FIFO)
  const allBatchRecords = []; // { batchId, ingredientId, quantityLeft, costPerUnit, restockedAt }
  const batchInsertData = [];

  for (const ing of INGREDIENTS) {
    const data = {
      ingredientId: ingMap[ing.ingredientName].id,
      restockedById: ADMIN_ID,
      quantityAdded: ing.initialStock,
      quantityLeft: ing.initialStock,
      costPerUnit: ing.costPerUnit,
      totalCost: Math.round(ing.initialStock * ing.costPerUnit * 100) / 100,
      isPriority: false,
      supplierName: "Initial Stock",
      notes: "Seeded inventory",
      restockedAt: SEED_START,
    };
    batchInsertData.push(data);
  }

  const createdBatches = await prisma.restockBatch.createMany({ data: batchInsertData, skipDuplicates: true });

  // Fetch back to get IDs
  const initialBatches = await prisma.restockBatch.findMany({
    where: { supplierName: "Initial Stock" },
    orderBy: { restockId: "asc" },
  });

  // Build in-memory batch inventory for FIFO tracking
  const batchInventory = new Map(); // ingredientId -> [{ batchId, quantityLeft, costPerUnit, restockedAt }]
  for (const batch of initialBatches) {
    const key = batch.ingredientId;
    if (!batchInventory.has(key)) batchInventory.set(key, []);
    batchInventory.get(key).push({
      batchId: batch.restockId,
      quantityLeft: Number(batch.quantityLeft),
      costPerUnit: Number(batch.costPerUnit),
      restockedAt: batch.restockedAt,
    });
  }
  console.log(`  ✓ ${initialBatches.length} initial restock batches`);

  // ── Phase 5: Generate Orders (730 days) ──
  console.log("\nPhase 5: Generating orders (730 days)...");

  // Build category maps for time-of-day weighting
  const coffeeVariants = variantMap.filter(v => v.subcategoryKey === "Coffee");
  const teaVariants = variantMap.filter(v => v.subcategoryKey === "Tea");
  const pastryVariants = variantMap.filter(v => v.subcategoryKey === "Pastries");
  const sandwichVariants = variantMap.filter(v => v.subcategoryKey === "Sandwiches");
  const riceVariants = variantMap.filter(v => v.subcategoryKey === "Rice Meals");
  const snackVariants = variantMap.filter(v => v.subcategoryKey === "Snacks");
  const coldDrinkVariants = variantMap.filter(v => v.subcategoryKey === "Cold Drinks");

  const PAIRINGS = {
    "Coffee": [...pastryVariants, ...pastryVariants],
    "Sandwiches": [...coldDrinkVariants, ...coldDrinkVariants],
    "Rice Meals": [...coldDrinkVariants, ...coldDrinkVariants],
    "Snacks": [...coldDrinkVariants, ...coldDrinkVariants, ...coffeeVariants],
    "Tea": [...pastryVariants, ...snackVariants],
    "Pastries": [...coffeeVariants, ...teaVariants],
    "Cold Drinks": [...snackVariants],
  };

  const orderRecords = [];
  const orderItemRecords = [];
  const cancellationRecords = [];
  const receiptRecords = [];
  const refundRecords = [];
  const deductionRecords = [];
  const adjustmentRecords = [];
  const counterRecords = [];
  const lossRecords = [];

  let totalOrderCount = 0;
  let totalItemCount = 0;
  let totalCancelled = 0;
  let totalCompleted = 0;
  let totalRefunded = 0;
  let dailyCounter = 0;
  let lastDateStr = "";

  for (let dayOffset = 0; dayOffset < TOTAL_DAYS; dayOffset++) {
    const date = addDays(SEED_START, dayOffset);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const month = date.getMonth();

    // Seasonal multiplier
    let seasonMultiplier = 1.0;
    if (month >= 2 && month <= 4) seasonMultiplier = 1.1; // Mar-May hot season
    else if (month >= 5 && month <= 8) seasonMultiplier = 0.9; // Jun-Sep rainy
    else if (month >= 9 && month <= 11) seasonMultiplier = 1.3; // Oct-Dec holiday

    const baseOrders = isWeekend ? randInt(25, 35) : randInt(15, 25);
    const ordersToday = Math.max(5, Math.round(baseOrders * seasonMultiplier));

    const dateKey = dateStr(date);
    if (dateKey !== lastDateStr) {
      dailyCounter = 0;
      lastDateStr = dateKey;
    }

    // Generate time slots
    const timeSlots = [];
    for (let i = 0; i < ordersToday; i++) {
      const hour = pickWeighted([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], [3, 5, 5, 4, 8, 10, 8, 4, 4, 3, 2, 2]);
      timeSlots.push({ hour, minute: randInt(0, 59) });
    }
    timeSlots.sort((a, b) => a.hour - b.hour || a.minute - b.minute);

    for (const slot of timeSlots) {
      totalOrderCount++;
      dailyCounter++;
      const orderId = uuid();
      const orderDate = startOfDay(date);
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
        primaryCategory = pickWeighted(["Cold Drinks", "Snacks"], [5, 5]);
      }

      const itemCount = pickWeighted([1, 2, 3, 4], [40, 35, 20, 5]);

      // Pick primary variant
      const categoryVariants = {
        "Coffee": coffeeVariants, "Tea": teaVariants, "Pastries": pastryVariants,
        "Sandwiches": sandwichVariants, "Rice Meals": riceVariants, "Snacks": snackVariants,
        "Cold Drinks": coldDrinkVariants,
      };
      const primaryVariants = categoryVariants[primaryCategory] || variantMap;
      const pickedVariants = [pick(primaryVariants)];

      // Pick additional items
      if (itemCount > 1) {
        const pairingPool = PAIRINGS[primaryCategory] || [];
        for (let i = 1; i < itemCount; i++) {
          const pool = pairingPool.filter(p => !pickedVariants.find(pv => pv.variantId === p.variantId));
          pickedVariants.push(pool.length > 0 ? pick(pool) : pick(variantMap));
        }
      }

      // Build order items
      let totalAmount = 0;
      const items = [];
      for (const v of pickedVariants) {
        const qty = (v.subcategoryKey === "Rice Meals" || v.subcategoryKey === "Sandwiches") ? 1 : randInt(1, 2);
        const subtotal = Number(v.price) * qty;
        totalAmount += subtotal;
        items.push({ productId: v.productId, variantId: v.variantId, quantity: qty, unitPrice: v.price, subtotal });
      }
      totalAmount = Math.round(totalAmount * 100) / 100;

      // Status: 88% completed, 12% cancelled
      const isCancelled = Math.random() < 0.12;
      const status = isCancelled ? "cancelled" : "completed";

      // Timestamps
      const acceptedAt = new Date(createdAt.getTime() + randInt(30, 120) * 1000);
      const preparingAt = new Date(acceptedAt.getTime() + randInt(10, 60) * 1000);
      const completedAt = isCancelled ? null : new Date(preparingAt.getTime() + randInt(120, 600) * 1000);
      const fulfillmentMinutes = completedAt ? Math.round((completedAt.getTime() - createdAt.getTime()) / 60000) : null;

      const cashierId = pick(CASHIER_IDS);

      orderRecords.push({
        orderId,
        orderNumber: dailyCounter,
        orderDate,
        customerName: pick(CUSTOMER_NAMES),
        tableNumber: pick(TABLES),
        orderSource: Math.random() < 0.85 ? "walk_in" : "online",
        status,
        acceptedAt,
        acceptedBy: cashierId,
        preparingAt: isCancelled ? null : preparingAt,
        preparingBy: isCancelled ? null : KITCHEN_ID,
        completedAt,
        completedBy: isCancelled ? null : KITCHEN_ID,
        fulfillmentMinutes,
        totalAmount,
        amountPaid: isCancelled ? null : totalAmount,
        change: isCancelled ? null : 0,
        createdBy: cashierId,
        createdAt,
      });

      // Create order items + deductions + adjustments
      for (const item of items) {
        totalItemCount++;
        const orderItemId = totalItemCount; // approximate for record tracking
        orderItemRecords.push({
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          isPrepared: !isCancelled,
          preparedBy: isCancelled ? null : KITCHEN_ID,
          preparedAt: isCancelled ? null : completedAt,
        });

        // Calculate ingredient needs from recipe
        const recipes = variantMap.find(v => v.variantId === item.variantId);
        // We need to look up recipes from the database for this variant
        // But we can compute from our PRODUCT definitions
        const prodDef = PRODUCTS.find(p => p.productName === recipes.productName);
        const variantDef = prodDef?.variants.find(v => v.sizeName === recipes.sizeName);

        if (variantDef) {
          for (const r of variantDef.recipes) {
            const ingId = ingMap[r.ingredientName]?.id;
            if (!ingId) continue;
            const totalNeeded = r.qty * item.quantity;

            // FIFO deduction from in-memory batches (only for completed orders)
            if (!isCancelled) {
              const batches = batchInventory.get(ingId) || [];
              let remaining = totalNeeded;
              const ingCostMap = [];

              for (const batch of batches) {
                if (remaining <= 0) break;
                if (batch.quantityLeft <= 0) continue;
                const toDeduct = Math.min(remaining, batch.quantityLeft);
                batch.quantityLeft -= toDeduct;
                remaining -= toDeduct;
                ingCostMap.push({ batchId: batch.batchId, qty: toDeduct, costPerUnit: batch.costPerUnit });
              }

              // Create deduction records
              for (const d of ingCostMap) {
                deductionRecords.push({
                  orderId,
                  ingredientId: ingId,
                  restockBatchId: d.batchId,
                  quantityDeducted: d.qty,
                  costPerUnit: d.costPerUnit,
                });
              }

              // Stock adjustment (deduction)
              const currentStock = batches.reduce((sum, b) => sum + b.quantityLeft, 0) + totalNeeded;
              adjustmentRecords.push({
                ingredientId: ingId,
                adjustedById: cashierId,
                adjustmentType: "deduction",
                quantityBefore: currentStock,
                quantityChanged: -totalNeeded,
                quantityAfter: currentStock - totalNeeded,
                relatedOrderId: orderId,
              });
            }
          }
        }
      }

      // Cancellation record
      if (isCancelled) {
        totalCancelled++;
        cancellationRecords.push({
          orderId,
          cancelledBy: cashierId,
          reason: pick(CANCELLATION_REASONS),
          cancelledAt: acceptedAt,
        });
      } else {
        totalCompleted++;
        receiptRecords.push({
          receiptId: uuid(),
          orderId,
          issuedBy: KITCHEN_ID,
          totalAmount,
          issuedAt: completedAt,
        });

        // 5% refund rate
        if (Math.random() < 0.05) {
          totalRefunded++;
          const refundAmount = Math.random() < 0.5 ? totalAmount : Math.round(totalAmount * randFloat(0.3, 0.7) * 100) / 100;
          refundRecords.push({
            orderId,
            amount: refundAmount,
            reason: pick(["Customer complaint", "Wrong order", "Quality issue", "Partial refund"]),
            refundedById: cashierId,
            refundedAt: completedAt,
          });
        }
      }
    }

    // Daily order counter
    if (dailyCounter > 0) {
      counterRecords.push({ date: startOfDay(date), counter: dailyCounter });
    }

    // Progress logging every 100 days
    if ((dayOffset + 1) % 100 === 0 || dayOffset === TOTAL_DAYS - 1) {
      console.log(`  ... ${dayOffset + 1}/${TOTAL_DAYS} days, ${totalOrderCount} orders so far`);
    }
  }

  // Bulk insert orders
  console.log(`\n  Inserting ${orderRecords.length} orders...`);
  await prisma.order.createMany({ data: orderRecords, skipDuplicates: true });
  console.log(`  ✓ Orders inserted`);

  // Bulk insert order items
  console.log(`  Inserting ${orderItemRecords.length} order items...`);
  const ITEM_BATCH = 5000;
  for (let i = 0; i < orderItemRecords.length; i += ITEM_BATCH) {
    await prisma.orderItem.createMany({ data: orderItemRecords.slice(i, i + ITEM_BATCH), skipDuplicates: true });
  }
  console.log(`  ✓ Order items inserted`);

  // Bulk insert cancellations
  if (cancellationRecords.length > 0) {
    await prisma.orderCancellation.createMany({ data: cancellationRecords, skipDuplicates: true });
    console.log(`  ✓ ${cancellationRecords.length} cancellations`);
  }

  // Bulk insert receipts
  if (receiptRecords.length > 0) {
    const RECEIPT_BATCH = 5000;
    for (let i = 0; i < receiptRecords.length; i += RECEIPT_BATCH) {
      await prisma.receipt.createMany({ data: receiptRecords.slice(i, i + RECEIPT_BATCH), skipDuplicates: true });
    }
    console.log(`  ✓ ${receiptRecords.length} receipts`);
  }

  // Bulk insert refunds
  if (refundRecords.length > 0) {
    await prisma.paymentRefund.createMany({ data: refundRecords, skipDuplicates: true });
    console.log(`  ✓ ${refundRecords.length} refunds`);
  }

  // Bulk insert deductions
  if (deductionRecords.length > 0) {
    console.log(`  Inserting ${deductionRecords.length} ingredient deductions...`);
    const DED_BATCH = 5000;
    for (let i = 0; i < deductionRecords.length; i += DED_BATCH) {
      await prisma.orderIngredientDeduction.createMany({ data: deductionRecords.slice(i, i + DED_BATCH), skipDuplicates: true });
    }
    console.log(`  ✓ Deductions inserted`);
  }

  // Bulk insert stock adjustments
  if (adjustmentRecords.length > 0) {
    console.log(`  Inserting ${adjustmentRecords.length} stock adjustments...`);
    const ADJ_BATCH = 5000;
    for (let i = 0; i < adjustmentRecords.length; i += ADJ_BATCH) {
      await prisma.stockAdjustment.createMany({ data: adjustmentRecords.slice(i, i + ADJ_BATCH), skipDuplicates: true });
    }
    console.log(`  ✓ Stock adjustments inserted`);
  }

  // Insert order counters
  if (counterRecords.length > 0) {
    await prisma.orderCounter.createMany({ data: counterRecords, skipDuplicates: true });
    console.log(`  ✓ ${counterRecords.length} order counters`);
  }

  // Update restock batch quantities to reflect deductions
  console.log("\n  Updating restock batch quantities...");
  const batchUpdates = [];
  for (const [ingId, batches] of batchInventory) {
    for (const batch of batches) {
      const original = initialBatches.find(b => b.restockId === batch.batchId);
      if (original && Number(original.quantityLeft) !== batch.quantityLeft) {
        batchUpdates.push(
          prisma.restockBatch.update({
            where: { restockId: batch.batchId },
            data: { quantityLeft: Math.max(0, batch.quantityLeft), version: { increment: 1 } },
          })
        );
      }
    }
  }
  if (batchUpdates.length > 0) {
    // Execute in chunks to avoid transaction limits
    for (let i = 0; i < batchUpdates.length; i += 50) {
      await prisma.$transaction(batchUpdates.slice(i, i + 50));
    }
  }
  console.log(`  ✓ ${batchUpdates.length} batches updated`);

  // ── Phase 6: Ongoing Restocking ──
  console.log("\nPhase 6: Ongoing restocking...");

  const restockInsertData = [];
  const suppliers = ["Supplier A", "Supplier B", "Supplier C"];

  for (const ing of INGREDIENTS) {
    const ingId = ingMap[ing.ingredientName].id;
    // Restock every 7-14 days, varying by ingredient importance
    const restockInterval = ing.initialStock > 10000 ? randInt(7, 10) : ing.initialStock > 3000 ? randInt(10, 14) : randInt(14, 21);

    let restockDay = randInt(5, 15);
    while (restockDay < TOTAL_DAYS) {
      const qty = Math.round(ing.initialStock * randInt(40, 80) / 100);
      const costFluctuation = randFloat(0.95, 1.05);
      const costPerUnit = Math.round(ing.costPerUnit * costFluctuation * 10000) / 10000;

      restockInsertData.push({
        ingredientId: ingId,
        restockedById: ADMIN_ID,
        quantityAdded: qty,
        quantityLeft: qty,
        costPerUnit,
        totalCost: Math.round(qty * costPerUnit * 100) / 100,
        isPriority: Math.random() < 0.15,
        supplierName: pick(suppliers),
        notes: `Scheduled restock`,
        restockedAt: addDays(SEED_START, restockDay),
      });

      restockDay += restockInterval + randInt(-2, 2);
    }
  }

  if (restockInsertData.length > 0) {
    const RESTOCK_BATCH = 2000;
    for (let i = 0; i < restockInsertData.length; i += RESTOCK_BATCH) {
      await prisma.restockBatch.createMany({ data: restockInsertData.slice(i, i + RESTOCK_BATCH), skipDuplicates: true });
    }
  }
  console.log(`  ✓ ${restockInsertData.length} ongoing restock batches`);

  // ── Phase 7: Loss Records ──
  console.log("\nPhase 7: Loss records...");

  const lossInsertData = [];
  const lossTypes = ["spoilage", "spillage", "expiry", "other"];

  // Generate ~3-5 loss records per month over 2 years = ~70-120 records
  for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
    const lossesThisMonth = randInt(3, 5);
    for (let j = 0; j < lossesThisMonth; j++) {
      const ing = pick(INGREDIENTS);
      const ingId = ingMap[ing.ingredientName].id;
      const dayOfMonth = randInt(1, 28);
      const lossDate = addDays(SEED_START, monthOffset * 30 + dayOfMonth);
      const qtyLost = randInt(10, Math.max(20, Math.round(ing.initialStock * 0.05)));
      const costPerUnit = ing.costPerUnit;

      lossInsertData.push({
        ingredientId: ingId,
        declaredById: KITCHEN_ID,
        lossType: pick(lossTypes),
        quantityLost: qtyLost,
        costPerUnit,
        totalCostLost: Math.round(qtyLost * costPerUnit * 100) / 100,
        notes: `${pick(["Routine check", "Storage issue", "Expired batch", "Accidental spill", "Quality control"])} — seeded`,
        loggedAt: lossDate,
      });
    }
  }

  if (lossInsertData.length > 0) {
    await prisma.lossRecord.createMany({ data: lossInsertData, skipDuplicates: true });
  }
  console.log(`  ✓ ${lossInsertData.length} loss records`);

  // ── Summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("════════════════════════════════════════");
  console.log(`  Days:            ${TOTAL_DAYS}`);
  console.log(`  Categories:      ${rootCategories.length} root + ${Object.keys(subMap).length} sub`);
  console.log(`  Ingredients:     ${INGREDIENTS.length}`);
  console.log(`  Products:        ${PRODUCTS.length}`);
  console.log(`  Variants:        ${variantMap.length}`);
  console.log(`  Recipes:         ${totalRecipes}`);
  console.log(`  Orders:          ${totalOrderCount}`);
  console.log(`  Order Items:     ${totalItemCount}`);
  console.log(`  Completed:       ${totalCompleted}`);
  console.log(`  Cancelled:       ${totalCancelled}`);
  console.log(`  Refunded:        ${totalRefunded}`);
  console.log(`  Deductions:      ${deductionRecords.length}`);
  console.log(`  Adjustments:     ${adjustmentRecords.length}`);
  console.log(`  Restock Batches: ${initialBatches.length + restockInsertData.length}`);
  console.log(`  Loss Records:    ${lossInsertData.length}`);
  console.log(`  Time:            ${elapsed}s`);
  console.log("════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
