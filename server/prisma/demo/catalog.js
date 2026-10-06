// Client menu with estimated portions and purchase costs, never confirmed recipes.
// Tuples keep the large catalog readable: ingredient [name, unit, threshold,
// shelfLifeDays, unitCost, legacyOpeningQuantity]; product [name, category,
// description, variants]; variant [size, price, recipe]; recipe [quantity, name].
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

const SUBS = {
  Beverages: ["Coffee", "Matcha Series", "Frappe", "Soda Pop", "Other Drinks",
    "Abbey's Special", "Non-Coffee", "Fruit Tea", "Probiotic"],
  Food: ["Add-ons", "All-Day Breakfast", "Salad", "Appetizers", "Sandwiches",
    "Pasta", "Desserts", "Rice Bowls", "Solo Meals", "Sizzling Series", "Main Course"],
};

// ── Products: [name, sub, desc, [[size, price, [[ing, qty]...]]]] ──
const P = [];

// ===== ESPRESSO (Hot16 / Cold16 / Cold22) =====
const ESP = [
  ["Americano", [[18, "Coffee Beans (Arabica, Roasted)"], [300, "Purified Water"], [10, "Sugar (Asukal)"]],
    [[18, "Coffee Beans (Arabica, Roasted)"], [220, "Purified Water"], [120, "Tube Ice"], [10, "Sugar (Asukal)"]],
    [[22, "Coffee Beans (Arabica, Roasted)"], [300, "Purified Water"], [160, "Tube Ice"], [12, "Sugar (Asukal)"]]],
  ["Latte", [[18, "Coffee Beans (Arabica, Roasted)"], [240, "Fresh Milk"], [10, "Sugar (Asukal)"]],
    [[18, "Coffee Beans (Arabica, Roasted)"], [190, "Fresh Milk"], [30, "Purified Water"], [120, "Tube Ice"], [10, "Sugar (Asukal)"]],
    [[22, "Coffee Beans (Arabica, Roasted)"], [270, "Fresh Milk"], [30, "Purified Water"], [160, "Tube Ice"], [12, "Sugar (Asukal)"]]],
  ["Vanilla Latte", "VAN"], ["French Vanilla", "FRE"], ["Hazelnut", "HAZ"],
];
function latteWith(extra) {
  return [
    [[18, "Coffee Beans (Arabica, Roasted)"], [240, "Fresh Milk"], [10, "Sugar (Asukal)"], [15, extra]],
    [[18, "Coffee Beans (Arabica, Roasted)"], [190, "Fresh Milk"], [30, "Purified Water"], [120, "Tube Ice"], [10, "Sugar (Asukal)"], [15, extra]],
    [[22, "Coffee Beans (Arabica, Roasted)"], [270, "Fresh Milk"], [30, "Purified Water"], [160, "Tube Ice"], [12, "Sugar (Asukal)"], [20, extra]],
  ];
}
const ESP_EXTRA = {
  "Americano": null, "Latte": null,
  "Vanilla Latte": "Easy Vanilla Powder", "French Vanilla": "DaVinci Gourmet French Vanilla Syrup",
  "Hazelnut": "DaVinci Gourmet Hazelnut Syrup", "White Chocolate": "Easy White Chocolate Powder",
};
for (const [name, hot, cold16, cold22] of ESP.slice(0, 2)) {
  P.push([name, "Coffee", name, [["Hot 16oz", 130, hot], ["Cold 16oz", 130, cold16], ["Cold 22oz", 150, cold22]]]);
}
for (const [name, tag] of ESP.slice(2)) {
  const extra = ESP_EXTRA[name];
  const r = latteWith(extra);
  P.push([name, "Coffee", name, [["Hot 16oz", 130, r[0]], ["Cold 16oz", 130, r[1]], ["Cold 22oz", 150, r[2]]]]);
}
{
  const r = latteWith("Easy White Chocolate Powder");
  P.push(["White Chocolate", "Coffee", "White chocolate latte", [["Hot 16oz", 130, r[0]], ["Cold 16oz", 130, r[1]], ["Cold 22oz", 150, r[2]]]]);
}
function espCustom(hot, c16, c22) {
  return [["Hot 16oz", 130, hot], ["Cold 16oz", 130, c16], ["Cold 22oz", 150, c22]];
}
P.push(["Cappuccino", "Coffee", "Espresso with thick milk foam", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [180, "Fresh Milk"], [30, "Whipping Cream"], [10, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [150, "Fresh Milk"], [30, "Whipping Cream"], [120, "Tube Ice"], [10, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [200, "Fresh Milk"], [40, "Whipping Cream"], [160, "Tube Ice"], [12, "Sugar (Asukal)"]])]);
P.push(["Caramel Macchiato", "Coffee", "Layered espresso with caramel", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [150, "Fresh Milk"], [20, "DaVinci Gourmet Caramel Syrup"], [8, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [150, "Fresh Milk"], [20, "DaVinci Gourmet Caramel Syrup"], [30, "Purified Water"], [120, "Tube Ice"], [8, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [200, "Fresh Milk"], [25, "DaVinci Gourmet Caramel Syrup"], [30, "Purified Water"], [160, "Tube Ice"], [10, "Sugar (Asukal)"]])]);
P.push(["Caramel Latte & Vanilla Cream", "Coffee", "Caramel latte with vanilla cream", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [220, "Fresh Milk"], [12, "DaVinci Gourmet Caramel Syrup"], [10, "Easy Vanilla Powder"], [30, "All-Purpose Cream"], [8, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [180, "Fresh Milk"], [12, "DaVinci Gourmet Caramel Syrup"], [10, "Easy Vanilla Powder"], [30, "All-Purpose Cream"], [120, "Tube Ice"], [8, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [250, "Fresh Milk"], [16, "DaVinci Gourmet Caramel Syrup"], [14, "Easy Vanilla Powder"], [40, "All-Purpose Cream"], [160, "Tube Ice"], [10, "Sugar (Asukal)"]])]);
P.push(["Spanish Latte", "Coffee", "Creamy espresso with condensed milk", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [200, "Fresh Milk"], [20, "Condensed Milk"], [8, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [170, "Fresh Milk"], [20, "Condensed Milk"], [120, "Tube Ice"], [8, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [250, "Fresh Milk"], [28, "Condensed Milk"], [160, "Tube Ice"], [10, "Sugar (Asukal)"]])]);
P.push(["Choco Hazelnut", "Coffee", "Hazelnut latte with chocolate", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [220, "Fresh Milk"], [12, "DaVinci Gourmet Hazelnut Syrup"], [12, "Cocoa Powder (Dark Chocolate)"], [10, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [180, "Fresh Milk"], [12, "DaVinci Gourmet Hazelnut Syrup"], [12, "Cocoa Powder (Dark Chocolate)"], [120, "Tube Ice"], [10, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [250, "Fresh Milk"], [15, "DaVinci Gourmet Hazelnut Syrup"], [15, "Cocoa Powder (Dark Chocolate)"], [160, "Tube Ice"], [12, "Sugar (Asukal)"]])]);
P.push(["Honey Milk Foam", "Coffee", "Honey latte with milk foam", espCustom(
  [[18, "Coffee Beans (Arabica, Roasted)"], [220, "Fresh Milk"], [15, "Pure Honey"], [30, "Whipping Cream"], [5, "Sugar (Asukal)"]],
  [[18, "Coffee Beans (Arabica, Roasted)"], [180, "Fresh Milk"], [15, "Pure Honey"], [30, "Whipping Cream"], [120, "Tube Ice"], [5, "Sugar (Asukal)"]],
  [[22, "Coffee Beans (Arabica, Roasted)"], [250, "Fresh Milk"], [20, "Pure Honey"], [40, "Whipping Cream"], [160, "Tube Ice"], [6, "Sugar (Asukal)"]])]);

// ===== MATCHA (16oz / 22oz) =====
function matchaWith(extra16, extra22) {
  return [
    [[8, "Matcha Powder"], [200, "Fresh Milk"], [60, "Purified Water"], [10, "Sugar (Asukal)"], [120, "Tube Ice"], ...extra16],
    [[11, "Matcha Powder"], [280, "Fresh Milk"], [80, "Purified Water"], [14, "Sugar (Asukal)"], [160, "Tube Ice"], ...extra22],
  ];
}
const MATCHA = [
  ["Matcha Latte", [], []], ["Dirty Matcha", [[18, "Coffee Beans (Arabica, Roasted)"]], [[22, "Coffee Beans (Arabica, Roasted)"]]],
  ["Matcha Strawberry Latte", [[30, "Strawberry Fruit Syrup"]], [[40, "Strawberry Fruit Syrup"]]],
  ["Matcha Mango Latte", [[30, "Mango Fruit Syrup"]], [[40, "Mango Fruit Syrup"]]],
  ["Matcha Blueberry Latte", [[30, "Blueberry Fruit Syrup"]], [[40, "Blueberry Fruit Syrup"]]],
  ["Matcha Butterscotch Latte", [[12, "Easy Butterscotch Powder"]], [[16, "Easy Butterscotch Powder"]]],
  ["Matcha Caramel", [[15, "DaVinci Gourmet Caramel Syrup"]], [[20, "DaVinci Gourmet Caramel Syrup"]]],
  ["Matcha Salted Caramel", [[12, "Easy Salted Caramel Powder"], [1, "Salt (Asin)"]], [[16, "Easy Salted Caramel Powder"], [1.5, "Salt (Asin)"]]],
];
for (const [name, e16, e22] of MATCHA) {
  const r = matchaWith(e16, e22);
  P.push([name, "Matcha Series", name, [["16oz", 130, r[0]], ["22oz", 150, r[1]]]]);
}

// ===== FRAPPE =====
function frappeWith(e16, e22) {
  return [
    [[180, "Tube Ice"], [120, "Fresh Milk"], [12, "Sugar (Asukal)"], [30, "Purified Water"], [30, "Whipping Cream"], ...e16],
    [[250, "Tube Ice"], [160, "Fresh Milk"], [16, "Sugar (Asukal)"], [40, "Purified Water"], [40, "Whipping Cream"], ...e22],
  ];
}
const FRAPPE = [
  ["Strawberry Frappe", [[20, "Strawberry Fruit Syrup"]], [[28, "Strawberry Fruit Syrup"]]],
  ["Blueberry Frappe", [[20, "Blueberry Fruit Syrup"]], [[28, "Blueberry Fruit Syrup"]]],
  ["Mango Frappe", [[20, "Mango Fruit Syrup"]], [[28, "Mango Fruit Syrup"]]],
  ["Matcha Frappe", [[10, "Matcha Powder"]], [[14, "Matcha Powder"]]],
  ["Choco Frappe", [[20, "Cocoa Powder (Dark Chocolate)"]], [[28, "Cocoa Powder (Dark Chocolate)"]]],
  ["White Chocolate Frappe", [[20, "Easy White Chocolate Powder"]], [[28, "Easy White Chocolate Powder"]]],
  ["Caramel Frappe", [[20, "DaVinci Gourmet Caramel Syrup"]], [[28, "DaVinci Gourmet Caramel Syrup"]]],
  ["Salted Caramel Frappe", [[20, "Easy Salted Caramel Powder"], [1, "Salt (Asin)"]], [[28, "Easy Salted Caramel Powder"], [1.5, "Salt (Asin)"]]],
  ["Vanilla Frappe", [[20, "Easy Vanilla Powder"]], [[28, "Easy Vanilla Powder"]]],
  ["Mocha Frappe", [[15, "Cocoa Powder (Dark Chocolate)"], [18, "Coffee Beans (Arabica, Roasted)"]], [[20, "Cocoa Powder (Dark Chocolate)"], [22, "Coffee Beans (Arabica, Roasted)"]]],
];
for (const [name, e16, e22] of FRAPPE) {
  const r = frappeWith(e16, e22);
  P.push([name, "Frappe", name, [["16oz", 130, r[0]], ["22oz", 150, r[1]]]]);
}

// ===== SODA POP =====
for (const [name, syrup] of [["Blueberry", "Blueberry Fruit Syrup"], ["Strawberry", "Strawberry Fruit Syrup"], ["Lychee", "Lychee Fruit Syrup"], ["Mango", "Mango Fruit Syrup"], ["Green Apple", "Green Apple Fruit Syrup"]]) {
  P.push([`${name} Soda Pop`, "Soda Pop", `${name} soda pop`, [
    ["16oz", 130, [[250, "Sprite (Fountain)"], [30, syrup], [120, "Tube Ice"], [30, "Purified Water"]]],
    ["22oz", 150, [[350, "Sprite (Fountain)"], [40, syrup], [160, "Tube Ice"], [40, "Purified Water"]]]]]);
}

// ===== OTHER DRINKS =====
P.push(["1.5L Softdrinks (Resale)", "Other Drinks", "1.5L bottled softdrink", [
  ["Coke 1.5L", 105, [[1, "Coca-Cola 1.5L Bottle"]]], ["Sprite 1.5L", 105, [[1, "Sprite 1.5L Bottle"]]],
  ["Royal 1.5L", 105, [[1, "Royal 1.5L Bottle"]]], ["Mountain Dew 1.5L", 105, [[1, "Mountain Dew 1.5L Bottle"]]]]]);
P.push(["Coke in Can", "Other Drinks", "Coke in can 320ml", [["Regular", 65, [[1, "Coke in Can 320ml"]]]]]);
P.push(["Pineapple Juice", "Other Drinks", "Pineapple juice serving", [["Regular", 65, [[250, "Pineapple Juice (RTD)"], [60, "Tube Ice"]]]]]);

// ===== ABBEY'S SPECIAL =====
P.push(["Biscoff Latte", "Abbey's Special", "Signature biscoff latte", [
  ["16oz", 160, [[18, "Coffee Beans (Arabica, Roasted)"], [220, "Fresh Milk"], [25, "Lotus Biscoff Spread"], [8, "Sugar (Asukal)"], [120, "Tube Ice"]]],
  ["22oz", 180, [[22, "Coffee Beans (Arabica, Roasted)"], [300, "Fresh Milk"], [35, "Lotus Biscoff Spread"], [10, "Sugar (Asukal)"], [160, "Tube Ice"]]]]]);
P.push(["Cookies & Cream Frappe", "Abbey's Special", "Cookies and cream frappe", [
  ["16oz", 160, [[180, "Tube Ice"], [120, "Fresh Milk"], [25, "Cookies & Cream Powder"], [10, "Sugar (Asukal)"], [30, "Whipping Cream"], [30, "Purified Water"]]],
  ["22oz", 180, [[250, "Tube Ice"], [160, "Fresh Milk"], [35, "Cookies & Cream Powder"], [14, "Sugar (Asukal)"], [40, "Whipping Cream"], [40, "Purified Water"]]]]]);
P.push(["Red Velvet Frappe", "Abbey's Special", "Red velvet frappe", [
  ["16oz", 160, [[180, "Tube Ice"], [120, "Fresh Milk"], [25, "Red Velvet Powder"], [10, "Sugar (Asukal)"], [30, "Whipping Cream"], [30, "Purified Water"]]],
  ["22oz", 180, [[250, "Tube Ice"], [160, "Fresh Milk"], [35, "Red Velvet Powder"], [14, "Sugar (Asukal)"], [40, "Whipping Cream"], [40, "Purified Water"]]]]]);
P.push(["Choco Salted Cream Cheese Frappe", "Abbey's Special", "Chocolate salted cream cheese frappe", [
  ["16oz", 160, [[180, "Tube Ice"], [120, "Fresh Milk"], [20, "Cocoa Powder (Dark Chocolate)"], [30, "Cream Cheese"], [1, "Salt (Asin)"], [10, "Sugar (Asukal)"], [30, "Whipping Cream"]]],
  ["22oz", 180, [[250, "Tube Ice"], [160, "Fresh Milk"], [28, "Cocoa Powder (Dark Chocolate)"], [40, "Cream Cheese"], [1.5, "Salt (Asin)"], [14, "Sugar (Asukal)"], [40, "Whipping Cream"]]]]]);

// ===== NON-COFFEE =====
function fruitMilk(syrup) {
  return [[["16oz", 130, [[200, "Fresh Milk"], [30, syrup], [10, "Sugar (Asukal)"], [120, "Tube Ice"]]],
    ["22oz", 150, [[280, "Fresh Milk"], [40, syrup], [14, "Sugar (Asukal)"], [160, "Tube Ice"]]]]];
}
P.push(["Strawberry Dark Choco", "Non-Coffee", "Strawberry dark chocolate", [
  ["16oz", 130, [[20, "Cocoa Powder (Dark Chocolate)"], [220, "Fresh Milk"], [15, "Strawberry Fruit Syrup"], [12, "Sugar (Asukal)"], [120, "Tube Ice"]]],
  ["22oz", 150, [[28, "Cocoa Powder (Dark Chocolate)"], [300, "Fresh Milk"], [20, "Strawberry Fruit Syrup"], [16, "Sugar (Asukal)"], [160, "Tube Ice"]]]]]);
P.push(["Abbey's Dark Choco", "Non-Coffee", "Signature dark chocolate", [
  ["16oz", 130, [[20, "Cocoa Powder (Dark Chocolate)"], [220, "Fresh Milk"], [12, "Sugar (Asukal)"], [120, "Tube Ice"]]],
  ["22oz", 150, [[28, "Cocoa Powder (Dark Chocolate)"], [300, "Fresh Milk"], [16, "Sugar (Asukal)"], [160, "Tube Ice"]]]]]);
P.push(["Abbey's Yard Choco", "Non-Coffee", "Extra-rich chocolate yard serving", [
  ["16oz", 130, [[25, "Cocoa Powder (Dark Chocolate)"], [250, "Fresh Milk"], [14, "Sugar (Asukal)"], [120, "Tube Ice"]]],
  ["22oz", 150, [[34, "Cocoa Powder (Dark Chocolate)"], [330, "Fresh Milk"], [18, "Sugar (Asukal)"], [160, "Tube Ice"]]]]]);
for (const [name, syrup] of [["Blueberry Fruit Milk", "Blueberry Fruit Syrup"], ["Mango Fruit Milk", "Mango Fruit Syrup"], ["Strawberry Fruit Milk", "Strawberry Fruit Syrup"]]) {
  P.push([name, "Non-Coffee", name, fruitMilk(syrup)[0]]);
}

// ===== FRUIT TEA / PROBIOTIC =====
const TEA = [["Strawberry", "Strawberry Fruit Syrup"], ["Blueberry", "Blueberry Fruit Syrup"], ["Mango", "Mango Fruit Syrup"], ["Kiwi", "Kiwi Fruit Syrup"], ["Passion Fruit", "Passion Fruit Syrup"], ["Lychee", "Lychee Fruit Syrup"]];
for (const [name, syrup] of TEA) {
  P.push([`${name} Fruit Tea`, "Fruit Tea", `${name} fruit tea`, [
    ["16oz", 130, [[150, "Allmytea Tea Base"], [30, syrup], [150, "Purified Water"], [10, "Sugar (Asukal)"], [120, "Tube Ice"]]],
    ["22oz", 150, [[200, "Allmytea Tea Base"], [40, syrup], [200, "Purified Water"], [14, "Sugar (Asukal)"], [160, "Tube Ice"]]]]]);
  P.push([`${name} Probiotic`, "Probiotic", `${name} probiotic drink`, [
    ["16oz", 130, [[80, "Yakult (Probiotic Drink)"], [25, syrup], [120, "Purified Water"], [120, "Tube Ice"]]],
    ["22oz", 150, [[160, "Yakult (Probiotic Drink)"], [35, syrup], [180, "Purified Water"], [160, "Tube Ice"]]]]]);
}
P.push(["Lemon Tea", "Fruit Tea", "Lemon fruit tea", [
  ["16oz", 130, [[150, "Allmytea Tea Base"], [0.5, "Lemon (Fresh)"], [15, "Sugar (Asukal)"], [200, "Purified Water"], [120, "Tube Ice"]]],
  ["22oz", 150, [[200, "Allmytea Tea Base"], [0.75, "Lemon (Fresh)"], [20, "Sugar (Asukal)"], [260, "Purified Water"], [160, "Tube Ice"]]]]]);
P.push(["Lemon Probiotic", "Probiotic", "Lemon probiotic drink", [
  ["16oz", 130, [[80, "Yakult (Probiotic Drink)"], [0.5, "Lemon (Fresh)"], [10, "Sugar (Asukal)"], [150, "Purified Water"], [120, "Tube Ice"]]],
  ["22oz", 150, [[160, "Yakult (Probiotic Drink)"], [0.75, "Lemon (Fresh)"], [14, "Sugar (Asukal)"], [200, "Purified Water"], [160, "Tube Ice"]]]]]);

// ===== FOOD =====
const R = (v) => [["Regular", v[0], v[1]]];
P.push(["Extra Rice", "Add-ons", "Extra plain rice", R([30, [[150, "Plain Rice (Uncooked)"]]])]);
P.push(["Fried Rice", "Add-ons", "Garlic fried rice", R([40, [[150, "Plain Rice (Uncooked)"], [0.5, "Chicken Egg"], [5, "Garlic (Bawang)"], [10, "Cooking Oil"], [2, "Salt (Asin)"], [5, "Soy Sauce (Toyo)"]]])]);
P.push(["Kimchi Side", "Add-ons", "Kimchi side serving", R([25, [[100, "Kimchi"]]])]);

const BREAKFAST = [
  ["American Breakfast", 220, [[70, "Sausage"], [40, "Bacon"], [1, "Chicken Egg"], [1, "Burger Buns"], [10, "Butter"]]],
  ["Abbey's Signature Tapsilog", 150, [[80, "Beef Tapa"], [150, "Plain Rice (Uncooked)"], [1, "Chicken Egg"], [20, "Tomato (Kamatis)"], [10, "Vinegar (Suka)"]]],
  ["Homemade Tocilog", 150, [[80, "Pork Tocino"], [150, "Plain Rice (Uncooked)"], [1, "Chicken Egg"], [20, "Tomato (Kamatis)"]]],
  ["Sausilog", 150, [[80, "Sausage"], [150, "Plain Rice (Uncooked)"], [1, "Chicken Egg"], [5, "Garlic (Bawang)"]]],
  ["Bacsilog", 150, [[70, "Bacon"], [150, "Plain Rice (Uncooked)"], [1, "Chicken Egg"], [1, "Sliced Cheese"]]],
  ["Cornsilog", 150, [[80, "Corned Beef"], [150, "Plain Rice (Uncooked)"], [1, "Chicken Egg"], [5, "Garlic (Bawang)"]]],
];
for (const [n, pr, rec] of BREAKFAST) P.push([n, "All-Day Breakfast", n, R([pr, rec])]);

P.push(["Kani Salad", "Salad", "Kani salad", R([150, [[60, "Lettuce"], [20, "Cucumber (Pipino)"], [60, "Crab Sticks"], [40, "Kani Sauce"], [10, "Mayonnaise"], [3, "Sesame Oil"]]])]);
P.push(["Caesar Salad", "Salad", "Caesar salad", R([150, [[70, "Lettuce"], [60, "Chicken Breast Fillet"], [40, "Caesar Dressing"], [10, "Parmesan Cheese"]]])]);
P.push(["Cilantro & Lime Salad", "Salad", "Cilantro lime salad", R([150, [[60, "Lettuce"], [60, "Chicken Breast Fillet"], [40, "Cilantro Lime Dressing"], [20, "Pineapple Tidbits"], [15, "Bell Pepper"]]])]);

const APP = [
  ["Cheesy Potato", 220, [[250, "Hash Brown (Frozen)"], [80, "Cheese Sauce (Ready)"], [30, "Bacon"], [10, "Sour Cream Powder"]]],
  ["Street Food Platter", 210, [[100, "Squid (Calamares)"], [80, "Shrimp (Hipon)"], [60, "Crab Sticks"], [40, "All-Purpose Flour (Harina)"], [0.5, "Chicken Egg"], [30, "Cooking Oil"], [15, "Vinegar (Suka)"], [15, "Red Onion (Sibuyas)"]]],
  ["Calamares Platter", 200, [[220, "Squid (Calamares)"], [50, "All-Purpose Flour (Harina)"], [1, "Chicken Egg"], [40, "Cooking Oil"], [20, "Mayonnaise"], [0.5, "Lemon (Fresh)"]]],
  ["Nachos", 180, [[120, "Nacho Chips"], [60, "Cheese Sauce (Ready)"], [60, "Ground Beef"], [30, "Tomato (Kamatis)"], [15, "Red Onion (Sibuyas)"], [10, "Bell Pepper"]]],
  ["Crispy Chicken Feet", 195, [[250, "Chicken Feet and Neck"], [15, "Soy Sauce (Toyo)"], [10, "Vinegar (Suka)"], [10, "Garlic (Bawang)"], [30, "Cooking Oil"], [5, "Sugar (Asukal)"], [2, "Ground Black Pepper (Paminta)"]]],
  ["Chicken Neck", 220, [[300, "Chicken Feet and Neck"], [18, "Soy Sauce (Toyo)"], [12, "Vinegar (Suka)"], [12, "Garlic (Bawang)"], [35, "Cooking Oil"], [6, "Sugar (Asukal)"], [2, "Ground Black Pepper (Paminta)"]]],
];
for (const [n, pr, rec] of APP) P.push([n, "Appetizers", n, R([pr, rec])]);
P.push(["French Fries", "Appetizers", "French fries", [
  ["Regular", 130, [[200, "Hash Brown (Frozen)"], [2, "Salt (Asin)"], [10, "Cooking Oil"], [30, "UFC Tomato Ketchup"]]],
  ["Cheese", 130, [[200, "Hash Brown (Frozen)"], [2, "Salt (Asin)"], [10, "Cooking Oil"], [30, "Cheese Sauce (Ready)"]]],
  ["BBQ", 130, [[200, "Hash Brown (Frozen)"], [2, "Salt (Asin)"], [10, "Cooking Oil"], [10, "BBQ Powder"]]],
  ["Sour Cream", 130, [[200, "Hash Brown (Frozen)"], [2, "Salt (Asin)"], [10, "Cooking Oil"], [10, "Sour Cream Powder"]]]]]);

P.push(["Graciana's Philly Cheese Steak", "Sandwiches", "Philly cheese steak sandwich", R([220, [[1, "Baguette"], [100, "Beef Strips"], [20, "Bell Pepper"], [20, "Red Onion (Sibuyas)"], [40, "Cheese Sauce (Ready)"], [10, "Butter"]]])]);
P.push(["Abbey's Subway Sandwich", "Sandwiches", "Subway-style sandwich, choice of filling", [
  ["Ham", 180, [[1, "Red Hotdog Loaf"], [70, "Ham"], [1, "Sliced Cheese"], [15, "Lettuce"], [20, "Tomato (Kamatis)"], [10, "Cucumber (Pipino)"], [15, "Mayonnaise"], [5, "Mustard"]]],
  ["Bacon", 180, [[1, "Red Hotdog Loaf"], [70, "Bacon"], [1, "Sliced Cheese"], [15, "Lettuce"], [20, "Tomato (Kamatis)"], [10, "Cucumber (Pipino)"], [15, "Mayonnaise"], [5, "Mustard"]]],
  ["Tuna", 180, [[1, "Red Hotdog Loaf"], [70, "Tuna"], [1, "Sliced Cheese"], [15, "Lettuce"], [20, "Tomato (Kamatis)"], [10, "Cucumber (Pipino)"], [15, "Mayonnaise"], [5, "Mustard"]]]]]);
P.push(["Clubhouse", "Sandwiches", "Clubhouse sandwich", R([150, [[2, "Burger Buns"], [50, "Ham"], [1, "Chicken Egg"], [1, "Sliced Cheese"], [15, "Lettuce"], [20, "Tomato (Kamatis)"], [15, "Mayonnaise"]]])]);
P.push(["Cheeseburger", "Sandwiches", "Cheeseburger", R([150, [[1, "Burger Buns"], [100, "Ground Beef"], [1, "Sliced Cheese"], [10, "Lettuce"], [15, "Tomato (Kamatis)"], [15, "UFC Tomato Ketchup"], [10, "Mayonnaise"]]])]);
P.push(["Grilled Cheese", "Sandwiches", "Grilled cheese sandwich", R([105, [[2, "Red Hotdog Loaf"], [2, "Sliced Cheese"], [15, "Butter"]]])]);

const PASTA = [
  ["Abbey's Seafood Pancit", 250, [[250, "Pancit Noodles (Dry)"], [100, "Shrimp (Hipon)"], [80, "Squid (Calamares)"], [60, "Crab Sticks"], [50, "Cabbage (Repolyo)"], [30, "Carrots"], [15, "Soy Sauce (Toyo)"], [15, "Cooking Oil"], [10, "Garlic (Bawang)"], [15, "Red Onion (Sibuyas)"], [10, "Calamansi"]]],
  ["Truffle Mac & Cheese", 215, [[120, "Macaroni (Dry)"], [80, "Cheese Sauce (Ready)"], [40, "All-Purpose Cream"], [10, "Truffle Sauce"], [10, "Parmesan Cheese"], [10, "Butter"]]],
  ["Cheesy Tuna Pesto", 170, [[100, "Linguine (Dry)"], [40, "Pesto Sauce"], [60, "Tuna"], [30, "All-Purpose Cream"], [8, "Parmesan Cheese"], [5, "Garlic (Bawang)"], [5, "Cooking Oil"]]],
  ["Creamy Carbonara", 150, [[100, "Spaghetti Pasta (Dry)"], [40, "Bacon"], [60, "All-Purpose Cream"], [0.5, "Chicken Egg"], [8, "Parmesan Cheese"], [5, "Garlic (Bawang)"], [2, "Ground Black Pepper (Paminta)"], [5, "Butter"]]],
  ["Baked Penne", 150, [[100, "Penne (Dry)"], [100, "Spaghetti Sauce"], [50, "Ground Beef"], [1, "Sliced Cheese"], [10, "Cheese Powder"]]],
  ["Meatball Spaghetti", 150, [[100, "Spaghetti Pasta (Dry)"], [60, "Ground Beef"], [30, "Ground Pork"], [100, "Spaghetti Sauce"], [10, "All-Purpose Flour (Harina)"], [5, "Garlic (Bawang)"], [5, "Parmesan Cheese"]]],
];
for (const [n, pr, rec] of PASTA) P.push([n, "Pasta", n, R([pr, rec])]);

P.push(["Mini Donuts", "Desserts", "Mini donuts, choice of flavor", [
  ["Ube", 100, [[80, "Pancake Mix"], [0.5, "Chicken Egg"], [15, "Butter"], [15, "Sugar (Asukal)"], [40, "Fresh Milk"], [10, "Ube Powder"], [10, "Cooking Oil"]]],
  ["Choco", 100, [[80, "Pancake Mix"], [0.5, "Chicken Egg"], [15, "Butter"], [15, "Sugar (Asukal)"], [40, "Fresh Milk"], [10, "Cocoa Powder (Dark Chocolate)"], [10, "Cooking Oil"]]],
  ["Matcha", 100, [[80, "Pancake Mix"], [0.5, "Chicken Egg"], [15, "Butter"], [15, "Sugar (Asukal)"], [40, "Fresh Milk"], [6, "Matcha Powder"], [10, "Cooking Oil"]]],
  ["White Choco", 100, [[80, "Pancake Mix"], [0.5, "Chicken Egg"], [15, "Butter"], [15, "Sugar (Asukal)"], [40, "Fresh Milk"], [10, "Easy White Chocolate Powder"], [10, "Cooking Oil"]]]]]);

const BOWLS = [
  ["Abbey's Bibimbowl", [[150, "Plain Rice (Uncooked)"], [60, "Ground Pork"], [30, "Kimchi"], [1, "Chicken Egg"], [20, "Carrots"], [15, "Cucumber (Pipino)"], [10, "Soy Sauce (Toyo)"], [3, "Sesame Oil"], [3, "Sugar (Asukal)"]]],
  ["Chicken Ala King", [[150, "Plain Rice (Uncooked)"], [100, "Chicken Breast Fillet"], [60, "All-Purpose Cream"], [30, "Canned Mushroom"], [10, "Butter"], [5, "All-Purpose Flour (Harina)"], [10, "Bell Pepper"]]],
  ["Katsu Bowl", [[150, "Plain Rice (Uncooked)"], [120, "Chicken Katsu (Frozen)"], [30, "Katsu Sauce"], [30, "Cabbage (Repolyo)"], [10, "Mayonnaise"]]],
];
for (const [n, rec] of BOWLS) P.push([n, "Rice Bowls", n, R([125, rec])]);

const SOLO = [
  ["Abbey's Signature Fried Chicken", [[1, "Chicken Leg Quarter"], [30, "All-Purpose Flour (Harina)"], [0.5, "Chicken Egg"], [3, "Salt (Asin)"], [2, "Ground Black Pepper (Paminta)"], [30, "Cooking Oil"], [5, "Garlic (Bawang)"], [150, "Plain Rice (Uncooked)"]]],
  ["Grilled Liempo", [[150, "Pork Liempo (Belly)"], [15, "Soy Sauce (Toyo)"], [10, "Calamansi"], [10, "Garlic (Bawang)"], [2, "Ground Black Pepper (Paminta)"], [5, "Cooking Oil"], [150, "Plain Rice (Uncooked)"]]],
  ["Toyomansi Porkchop", [[150, "Toyomansi Marinated Meat"], [5, "Calamansi"], [150, "Plain Rice (Uncooked)"], [10, "Cooking Oil"]]],
  ["Chicken BBQ", [[150, "Chicken BBQ (Marinated)"], [150, "Plain Rice (Uncooked)"], [5, "Cooking Oil"], [5, "Soy Sauce (Toyo)"]]],
  ["Beef Misono", [[150, "Beef Strips"], [20, "Miso Paste"], [10, "Butter"], [5, "Garlic (Bawang)"], [150, "Plain Rice (Uncooked)"]]],
  ["Burger Steak", [[120, "Ground Beef"], [10, "All-Purpose Flour (Harina)"], [0.5, "Chicken Egg"], [50, "Gravy Sauce"], [150, "Plain Rice (Uncooked)"], [15, "Red Onion (Sibuyas)"]]],
];
for (const [n, rec] of SOLO) P.push([n, "Solo Meals", n, R([150, rec])]);

function sharing(rec, soloPrice, sharePrice) {
  const scaled = rec.map(([q, ing]) => [Math.round(q * 2.5 * 100) / 100, ing]);
  return [["Solo", soloPrice, rec], ["Sharing (2-3)", sharePrice, scaled]];
}
const SIZ = [
  ["Crispy Pork Sisig", 200, 350, [[150, "Pork Jowls"], [30, "Red Onion (Sibuyas)"], [10, "Calamansi"], [1, "Chicken Egg"], [15, "Mayonnaise"], [2, "Salt (Asin)"], [10, "Cooking Oil"], [2, "Ground Black Pepper (Paminta)"], [150, "Plain Rice (Uncooked)"]]],
  ["Crispy Kare Kare", 200, 350, [[150, "Pork Kasim (Shoulder)"], [80, "Kare-Kare Sauce"], [40, "Bok Choy (Petchay)"], [30, "Cabbage (Repolyo)"], [15, "Shrimp Paste (Alamang)"], [150, "Plain Rice (Uncooked)"], [15, "Cooking Oil"]]],
  ["Crispy Pork Sinigang", 200, 350, [[150, "Pork Liempo (Belly)"], [11, "Sinigang Mix"], [40, "Tomato (Kamatis)"], [20, "Red Onion (Sibuyas)"], [30, "White Radish (Labanos)"], [200, "Purified Water"], [150, "Plain Rice (Uncooked)"]]],
  ["Pork Butterfly Steak", 250, 480, [[180, "Pork Butterfly Cut"], [15, "Soy Sauce (Toyo)"], [10, "Calamansi"], [10, "Garlic (Bawang)"], [10, "Butter"], [2, "Ground Black Pepper (Paminta)"], [150, "Plain Rice (Uncooked)"], [20, "Red Onion (Sibuyas)"]]],
];
for (const [n, sp, shp, rec] of SIZ) P.push([n, "Sizzling Series", n, sharing(rec, sp, shp)]);

const MAIN = [
  ["Pork Sinigang", 490, [[400, "Pork Liempo (Belly)"], [22, "Sinigang Mix"], [80, "Tomato (Kamatis)"], [40, "Red Onion (Sibuyas)"], [60, "White Radish (Labanos)"], [60, "Bok Choy (Petchay)"], [500, "Purified Water"]]],
  ["Crispy Pork Binagoongan", 395, [[350, "Pork Kasim (Shoulder)"], [40, "Shrimp Paste (Alamang)"], [50, "Tomato (Kamatis)"], [30, "Red Onion (Sibuyas)"], [20, "Vinegar (Suka)"], [10, "Sugar (Asukal)"]]],
  ["Breaded Pork Chop", 395, [[350, "Pork Chop"], [40, "All-Purpose Flour (Harina)"], [1, "Chicken Egg"], [40, "Cooking Oil"], [3, "Salt (Asin)"], [2, "Ground Black Pepper (Paminta)"]]],
  ["Grilled Liempo (Platter)", 385, [[350, "Pork Liempo (Belly)"], [30, "Soy Sauce (Toyo)"], [20, "Calamansi"], [20, "Garlic (Bawang)"]]],
  ["Classic Adobo", 395, [[350, "Pork Kasim (Shoulder)"], [40, "Soy Sauce (Toyo)"], [30, "Vinegar (Suka)"], [20, "Garlic (Bawang)"], [3, "Ground Black Pepper (Paminta)"], [8, "Sugar (Asukal)"], [10, "Cooking Oil"]]],
  ["Beef Salpicao", 435, [[350, "Beef Strips"], [30, "Garlic (Bawang)"], [20, "Butter"], [20, "Soy Sauce (Toyo)"], [3, "Ground Black Pepper (Paminta)"], [10, "Cooking Oil"]]],
  ["Creamy Beef Mushroom", 425, [[300, "Beef Strips"], [100, "All-Purpose Cream"], [60, "Canned Mushroom"], [15, "Butter"], [10, "Garlic (Bawang)"]]],
  ["Beef Bistek Tagalog", 425, [[350, "Beef Strips"], [40, "Soy Sauce (Toyo)"], [1, "Lemon (Fresh)"], [60, "Red Onion (Sibuyas)"]]],
  ["Beef Burger Steak (Platter)", 415, [[300, "Ground Beef"], [20, "All-Purpose Flour (Harina)"], [1, "Chicken Egg"], [100, "Gravy Sauce"], [30, "Red Onion (Sibuyas)"], [30, "Canned Mushroom"]]],
  ["Sweet and Sour Fish", 325, [[300, "Fish (Bangus/Tilapia)"], [30, "Vinegar (Suka)"], [20, "Sugar (Asukal)"], [30, "UFC Tomato Ketchup"], [30, "Bell Pepper"], [20, "Red Onion (Sibuyas)"], [40, "Pineapple Tidbits"], [20, "All-Purpose Flour (Harina)"], [30, "Cooking Oil"]]],
  ["Fish n Chips", 485, [[350, "Fish (Bangus/Tilapia)"], [60, "All-Purpose Flour (Harina)"], [200, "Hash Brown (Frozen)"], [50, "Cooking Oil"], [30, "Mayonnaise"], [0.5, "Lemon (Fresh)"]]],
  ["Orange Chicken", 425, [[300, "Chicken Breast Fillet"], [60, "Orange Juice"], [15, "Sugar (Asukal)"], [10, "Soy Sauce (Toyo)"], [30, "All-Purpose Flour (Harina)"], [1, "Chicken Egg"], [30, "Cooking Oil"], [8, "Garlic (Bawang)"]]],
  ["Creamy Mushroom Chicken", 395, [[300, "Chicken Breast Fillet"], [100, "All-Purpose Cream"], [60, "Canned Mushroom"], [15, "Butter"]]],
  ["Chicken Teriyaki", 385, [[300, "Chicken Breast Fillet"], [30, "Soy Sauce (Toyo)"], [15, "Sugar (Asukal)"], [5, "Sesame Oil"], [8, "Garlic (Bawang)"]]],
  ["Fried Chicken (Platter)", 385, [[2, "Chicken Leg Quarter"], [50, "All-Purpose Flour (Harina)"], [1, "Chicken Egg"], [50, "Cooking Oil"], [5, "Salt (Asin)"]]],
  ["Chicken BBQ (Platter)", 385, [[350, "Chicken BBQ (Marinated)"], [10, "Cooking Oil"]]],
  ["Seafood Chop Suey", 235, [[80, "Shrimp (Hipon)"], [60, "Squid (Calamares)"], [40, "Crab Sticks"], [60, "Cabbage (Repolyo)"], [40, "Carrots"], [20, "Bell Pepper"], [60, "Mixed Vegetables Small (Frozen)"], [15, "Oyster Sauce"], [8, "Garlic (Bawang)"], [10, "Cooking Oil"]]],
  ["Stir Fry Veggies", 225, [[150, "Mixed Vegetables Big (Frozen)"], [50, "Cabbage (Repolyo)"], [30, "Carrots"], [15, "Bell Pepper"], [15, "Oyster Sauce"], [8, "Garlic (Bawang)"], [10, "Cooking Oil"], [3, "Sesame Oil"]]],
];
for (const [n, pr, rec] of MAIN) P.push([n, "Main Course", n + " (good for 2-3)", R([pr, rec])]);


// Remove an old invented product and restore the client's non-coffee menu item.
ING.push(["Easy Caramel Sauce", "ml", 200, 180, 0.45, 1000]);
ING.push(["Easy Chocolate Sauce", "ml", 200, 180, 0.45, 1000]);
P.splice(P.findIndex(([name]) => name === "Abbey's Yard Choco"), 1);
P.push(["Choco Caramel", "Non-Coffee", "Chocolate caramel milk", [
  ["16oz", 130, [[20, "Cocoa Powder (Dark Chocolate)"], [220, "Fresh Milk"], [15, "Easy Caramel Sauce"], [120, "Tube Ice"]]],
  ["22oz", 150, [[28, "Cocoa Powder (Dark Chocolate)"], [300, "Fresh Milk"], [20, "Easy Caramel Sauce"], [160, "Tube Ice"]]],
]]);
P.find(([name]) => name === "Abbey's Seafood Pancit")[3][0][1] = 250;
// Rice quantities describe dry grain, rather than the heavier cooked serving.
for (const [, , , variants] of P) for (const [, , recipe] of variants) {
  for (const row of recipe) if (row[1] === "Plain Rice (Uncooked)") row[0] = Math.round(row[0] / 3);
}
// Purchased resale bottles must have a purchase estimate distinct from retail.
for (const row of ING) if (row[0].endsWith("1.5L Bottle")) row[4] = 75;
export const ingredients = ING;
export const categories = SUBS;
export const products = P;
