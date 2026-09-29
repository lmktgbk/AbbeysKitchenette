import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_ID = "8b61ffe2-0ff4-43ed-8878-8a4fda1ec086";
const BASE_DATE = new Date("2025-01-01T08:00:00+08:00");

// [name, unit, threshold, expiryDays, costPerUnit, openingQty(2wk)]
const ING = [
  // A. Dairy & coffee base
  ["Fresh Milk", "ml", 3000, 7, 0.095, 20000],
  ["Whipping Cream", "ml", 500, 14, 0.28, 3000],
  ["Coffee Beans (Arabica, Roasted)", "g", 500, 180, 1.0, 3000],
  // B. Coffee syrups & sweeteners
  ["DaVinci Gourmet Caramel Syrup", "ml", 200, 365, 0.65, 1000],
  ["DaVinci Gourmet Hazelnut Syrup", "ml", 150, 365, 0.65, 750],
  ["DaVinci Gourmet French Vanilla Syrup", "ml", 200, 365, 0.65, 1000],
  ["Easy White Chocolate Powder", "g", 400, 365, 0.5, 2000],
  ["Easy Butterscotch Powder", "g", 200, 365, 0.5, 1000],
  ["Easy Vanilla Powder", "g", 200, 365, 0.48, 1000],
  ["Easy Salted Caramel Powder", "g", 300, 365, 0.52, 1500],
  ["Condensed Milk", "g", 780, 180, 0.19, 3900],
  ["Pure Honey", "ml", 200, 730, 0.6, 1000],
  ["Lotus Biscoff Spread", "g", 300, 180, 0.55, 1200],
  // C. Fruit syrups & tea base
  ["Strawberry Fruit Syrup", "ml", 300, 365, 0.32, 1500],
  ["Blueberry Fruit Syrup", "ml", 300, 365, 0.34, 1500],
  ["Mango Fruit Syrup", "ml", 300, 365, 0.32, 1500],
  ["Lychee Fruit Syrup", "ml", 200, 365, 0.34, 1000],
  ["Green Apple Fruit Syrup", "ml", 200, 365, 0.32, 1000],
  ["Kiwi Fruit Syrup", "ml", 200, 365, 0.34, 1000],
  ["Passion Fruit Syrup", "ml", 200, 365, 0.36, 1000],
  ["Allmytea Tea Base", "ml", 600, 30, 0.1, 3000],
  // D. Beverage basics
  ["Sprite (Fountain)", "ml", 3000, 180, 0.057, 20000],
  ["Tube Ice", "g", 10000, 7, 0.008, 60000],
  ["Purified Water", "ml", 5000, 30, 0.002, 40000],
  // E. Sinkers
  ["Strawberry Popping Boba", "g", 400, 180, 0.15, 2000],
  ["Blueberry Popping Boba", "g", 400, 180, 0.15, 2000],
  ["Mango Popping Boba", "g", 400, 180, 0.15, 2000],
  ["Lychee Popping Boba", "g", 300, 180, 0.15, 1500],
  ["Green Apple Popping Boba", "g", 300, 180, 0.15, 1500],
  ["Coconut Jelly (Nata)", "g", 400, 180, 0.12, 2000],
  // F. Fresh produce
  ["Red Onion (Sibuyas)", "g", 1200, 14, 0.15, 5000],
  ["Garlic (Bawang)", "g", 700, 21, 0.13, 3000],
  ["Cabbage (Repolyo)", "g", 1200, 7, 0.08, 5000],
  ["Carrots", "g", 1000, 14, 0.1, 4000],
  ["Bok Choy (Petchay)", "g", 700, 4, 0.06, 3000],
  ["Cucumber (Pipino)", "g", 700, 7, 0.07, 3000],
  ["Tomato (Kamatis)", "g", 1000, 5, 0.08, 4000],
  ["White Radish (Labanos)", "g", 500, 7, 0.06, 2000],
  ["Orange (Fresh)", "pcs", 8, 14, 20.0, 30],
  ["Lemon (Fresh)", "pcs", 8, 14, 15.0, 30],
  ["Calamansi", "g", 500, 7, 0.1, 2000],
  ["Bell Pepper", "g", 500, 7, 0.2, 2000],
  ["Mixed Vegetables Small (Frozen)", "g", 500, 90, 0.14, 2500],
  ["Mixed Vegetables Big (Frozen)", "g", 1000, 90, 0.12, 5000],
  ["Lettuce", "g", 700, 4, 0.12, 3000],
  // G. Frozen meats & seafood
  ["Ham", "g", 800, 90, 0.4, 3000],
  ["Bacon", "g", 500, 90, 0.6, 2000],
  ["Chicken Egg", "pcs", 30, 21, 8.0, 120],
  ["Sausage", "g", 800, 90, 0.3, 3000],
  ["Corned Beef", "g", 500, 180, 0.45, 2000],
  ["Beef Strips", "g", 800, 120, 0.55, 3000],
  ["Ground Pork", "g", 1200, 90, 0.35, 5000],
  ["Ground Beef", "g", 1000, 90, 0.45, 4000],
  ["Crab Sticks", "g", 500, 120, 0.3, 2000],
  ["Tuna", "g", 800, 120, 0.4, 3000],
  ["Chicken Breast Fillet", "g", 2000, 90, 0.2, 8000],
  ["Chicken Katsu (Frozen)", "g", 1200, 90, 0.35, 5000],
  ["Chicken Leg Quarter", "pcs", 15, 90, 45.0, 60],
  ["Pork Liempo (Belly)", "g", 2000, 90, 0.36, 8000],
  ["Pork Chop", "g", 2000, 90, 0.34, 8000],
  ["Pork Jowls", "g", 1500, 90, 0.28, 6000],
  ["Pork Kasim (Shoulder)", "g", 1500, 90, 0.34, 6000],
  ["Fish (Bangus/Tilapia)", "g", 1500, 90, 0.2, 6000],
  ["Pork Butterfly Cut", "g", 1200, 90, 0.35, 5000],
  // H. Marinated meats
  ["Toyomansi Marinated Meat", "g", 1000, 30, 0.32, 4000],
  ["Chicken BBQ (Marinated)", "g", 1500, 30, 0.22, 6000],
  ["Beef Tapa", "g", 1000, 30, 0.45, 4000],
  ["Pork Tocino", "g", 1000, 30, 0.35, 4000],
  // I. Sauces
  ["Kani Sauce", "ml", 300, 90, 0.25, 1500],
  ["Caesar Dressing", "ml", 300, 90, 0.28, 1500],
  ["Cilantro Lime Dressing", "ml", 200, 60, 0.3, 1000],
  ["Sandwich Spread", "g", 500, 90, 0.22, 2000],
  ["Spaghetti Sauce", "g", 1000, 180, 0.18, 4000],
  ["Pesto Sauce", "g", 300, 90, 0.45, 1500],
  ["Gravy Sauce", "ml", 500, 60, 0.15, 2000],
  ["Cheese Sauce (Ready)", "ml", 500, 60, 0.25, 2000],
  ["Kare-Kare Sauce", "g", 500, 60, 0.28, 2000],
  ["Katsu Sauce", "ml", 300, 120, 0.3, 1500],
  ["Shrimp Paste (Alamang)", "g", 300, 120, 0.2, 1500],
  // J. Condiments & dry goods
  ["Evaporated Milk", "ml", 700, 180, 0.12, 3000],
  ["All-Purpose Cream", "ml", 500, 180, 0.18, 2000],
  ["Sinigang Mix", "g", 200, 365, 0.35, 1000],
  ["Kare-Kare Mix", "g", 200, 365, 0.4, 800],
  ["Truffle Sauce", "ml", 150, 180, 1.2, 500],
  ["Canned Mushroom", "g", 400, 365, 0.28, 1500],
  ["Taco Powder", "g", 200, 365, 0.6, 800],
  ["BBQ Powder", "g", 200, 365, 0.55, 800],
  ["Cheese Powder", "g", 300, 365, 0.45, 1500],
  ["Sour Cream Powder", "g", 200, 365, 0.55, 800],
  ["Cheese Sauce Powder", "g", 200, 365, 0.5, 1000],
  ["Chicken Broth Cubes", "pcs", 10, 365, 6.0, 40],
  ["Beef Broth Cubes", "pcs", 10, 365, 6.5, 40],
  ["Pancake Mix", "g", 500, 365, 0.16, 2000],
  ["Banana Ketchup", "ml", 500, 365, 0.1, 2000],
  ["Mayonnaise", "ml", 500, 120, 0.2, 2000],
  ["Knorr Liquid Seasoning", "ml", 200, 365, 0.25, 1000],
  ["Soy Sauce (Toyo)", "ml", 700, 365, 0.08, 3000],
  ["Vinegar (Suka)", "ml", 700, 365, 0.05, 3000],
  ["Cooking Oil", "ml", 2000, 365, 0.09, 8000],
  ["Salt (Asin)", "g", 500, 730, 0.03, 2000],
  ["MSG (Vetsin)", "g", 200, 730, 0.15, 1000],
  ["Ground Black Pepper (Paminta)", "g", 150, 730, 1.0, 500],
  ["Sugar (Asukal)", "g", 1200, 730, 0.08, 5000],
  ["Oyster Sauce", "ml", 300, 365, 0.18, 1500],
  ["Sesame Oil", "ml", 150, 365, 0.8, 500],
  ["UFC Tomato Ketchup", "ml", 500, 365, 0.12, 2000],
  ["Parmesan Cheese", "g", 200, 180, 1.1, 800],
  ["Orange Juice", "ml", 500, 90, 0.1, 2000],
  ["Pineapple Tidbits", "g", 400, 365, 0.16, 1500],
  ["Hash Brown (Frozen)", "g", 600, 120, 0.22, 2500],
  ["All-Purpose Flour (Harina)", "g", 1200, 365, 0.06, 5000],
  ["Kimchi", "g", 400, 30, 0.35, 1500],
  ["Sliced Cheese", "pcs", 15, 90, 8.0, 60],
  ["Butter", "g", 500, 90, 0.6, 2000],
  ["Mustard", "ml", 200, 365, 0.2, 800],
  // K. Bread
  ["Red Hotdog Loaf", "pcs", 25, 4, 12.0, 100],
  ["Green Hotdog Loaf", "pcs", 25, 4, 12.0, 100],
  ["Baguette", "pcs", 10, 3, 55.0, 40],
  ["Burger Buns", "pcs", 30, 4, 12.0, 120],
  // L. Pasta & noodles
  ["Linguine (Dry)", "g", 1000, 730, 0.14, 4000],
  ["Penne (Dry)", "g", 1000, 730, 0.13, 4000],
  ["Spaghetti Pasta (Dry)", "g", 1200, 730, 0.12, 5000],
  ["Macaroni (Dry)", "g", 700, 730, 0.12, 3000],
  ["Pancit Noodles (Dry)", "g", 1000, 730, 0.13, 4000],
  // M. Gap ingredients (menu coverage)
  ["Plain Rice (Uncooked)", "g", 7000, 180, 0.06, 30000],
  ["Matcha Powder", "g", 300, 365, 1.8, 1500],
  ["Yakult (Probiotic Drink)", "ml", 2000, 21, 0.1625, 9600],
  ["Coca-Cola 1.5L Bottle", "pcs", 6, 180, 105.0, 24],
  ["Royal 1.5L Bottle", "pcs", 3, 180, 105.0, 12],
  ["Mountain Dew 1.5L Bottle", "pcs", 3, 180, 105.0, 12],
  ["Coke in Can 320ml", "pcs", 12, 180, 48.0, 48],
  ["Sprite 1.5L Bottle", "pcs", 6, 180, 105.0, 24],
  ["Pineapple Juice (RTD)", "ml", 1500, 90, 0.1, 6000],
  ["Cocoa Powder (Dark Chocolate)", "g", 600, 365, 0.55, 2500],
  ["Ube Powder", "g", 200, 365, 0.7, 800],
  ["Red Velvet Powder", "g", 200, 365, 0.65, 800],
  ["Cookies & Cream Powder", "g", 200, 365, 0.6, 1000],
  ["Cream Cheese", "g", 400, 60, 0.55, 1500],
  ["Squid (Calamares)", "g", 1000, 90, 0.35, 4000],
  ["Shrimp (Hipon)", "g", 1000, 90, 0.45, 4000],
  ["Nacho Chips", "g", 600, 120, 0.25, 2500],
  ["Chicken Feet and Neck", "g", 1000, 90, 0.12, 4000],
  ["Miso Paste", "g", 200, 180, 0.4, 800],
];

async function main() {
  console.log(`Phase 1: seeding ${ING.length} ingredients (1 batch each)...`);
  let n = 0;
  for (const [name, unit, threshold, expDays, cost, qty] of ING) {
    const ing = await prisma.ingredient.upsert({
      where: { ingredientName: name },
      update: { unit, minimumThreshold: threshold },
      create: { ingredientName: name, unit, minimumThreshold: threshold },
    });
    const existing = await prisma.restockBatch.count({ where: { ingredientId: ing.ingredientId } });
    if (existing === 0) {
      const expiry = new Date(BASE_DATE.getTime() + expDays * 86400000);
      await prisma.restockBatch.create({
        data: {
          ingredientId: ing.ingredientId,
          restockedById: ADMIN_ID,
          quantityAdded: qty,
          quantityLeft: qty,
          costPerUnit: cost,
          totalCost: Math.round(qty * cost * 100) / 100,
          supplierName: "Abbey's Opening Stock",
          notes: "Initial seed batch (2-week opening)",
          expiryDate: expiry,
          restockedAt: BASE_DATE,
        },
      });
    }
    if (++n % 30 === 0) console.log(`  ... ${n}/${ING.length}`);
  }
  console.log(`  ✓ ${n} ingredients, ${await prisma.restockBatch.count()} batches`);
}

main()
  .catch((e) => { console.error("Ingredients seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
