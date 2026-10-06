/** Export a reviewable demo dataset. This command never opens a database connection. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingredients, products, categories } from "./demo/catalog.js";
import { START, dates, validateCatalog, seedId, units, SeedError, fingerprint } from "./demo/plan.js";
import { forecastDemoDay, assumptions } from "./demo/forecast-plan.js";

const args = process.argv.slice(2);
if (args.some((a) => !/^--(through|output)=/.test(a))) throw new SeedError("Only --through and --output are accepted; this command cannot apply or reset data");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const through = args.find((a) => a.startsWith("--through="))?.slice(10) || new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
if (through >= today) throw new SeedError("Only completed Manila days may be simulated");
const days = dates(START, through);
validateCatalog();
const output = resolve(args.find((a) => a.startsWith("--output="))?.slice(9) || fileURLToPath(new URL("../../audit/forecast-demo-dataset", import.meta.url)));
const money = (v) => Math.round(v*100)/100;
const quote = (v) => `"${String(v).replaceAll('"','""')}"`;
const catalog = new Map(); let variantId = 0;
products.forEach(([name, category, , sizes]) => sizes.forEach(([size, price]) => catalog.set(`${name}|${size}`, {
  variant_id: ++variantId, product_id: seedId(`product:${name}`), product_name: name, size_name: size, price,
  category_id: Object.values(categories).flat().indexOf(category)+1,
})));
const csv = ["variant_id,product_id,product_name,size_name,price,category_id,ds,units"];
const baskets = []; const daily = []; const consumption = new Map();
let totalOrders = 0, synthetic = 0, samples = 0, itemUnits = 0, sampleUnits = 0, revenue = 0, purchaseCost = 0;
for (const day of days) {
  const orders = forecastDemoDay(day); const grouped = new Map(); const needs = new Map();
  let sales = 0, cash = 0;
  for (const order of orders) {
    totalOrders++; if (order.source === "receipt") { samples++; sampleUnits += order.lines.reduce((sum,line)=>sum+line.quantity,0); } else synthetic++;
    const total = money(order.lines.reduce((s,l)=>s+l.quantity*l.price,0)); sales += total;
    if (order.payment === "cash") cash += total;
    baskets.push(JSON.stringify({ id: order.id, date: day, source: order.source, status: "completed", payment: order.payment,
      subtotal: total, total, paid: total, change: 0,
      items: order.lines.map((l)=>({ variant_id: catalog.get(`${l.name}|${l.size}`).variant_id, quantity:l.quantity, price:l.price })) }));
    for (const line of order.lines) {
      const key = `${line.name}|${line.size}`; grouped.set(key,(grouped.get(key)||0)+line.quantity); itemUnits += line.quantity;
      for (const [quantity,name] of line.recipe) needs.set(name,units((needs.get(name)||0)+units(quantity*line.quantity)));
    }
  }
  for (const [key, quantity] of grouped) {
    const v = catalog.get(key); csv.push([v.variant_id,v.product_id,v.product_name,v.size_name,v.price,v.category_id,day,quantity].map(quote).join(','));
  }
  const purchases = ingredients.filter(([name])=>needs.has(name)).map(([name,unit,,,cost])=>({ name,unit,quantity:needs.get(name),cost:money(needs.get(name)*cost),remaining:0 }));
  // Estimated just-in-time purchases cover exact recipe use; historical batches
  // are exhausted. This is a consistent demo ledger, not evidence of actual costs.
  for (const purchase of purchases) consumption.set(purchase.name,units((consumption.get(purchase.name)||0)+purchase.quantity));
  const cost = money(purchases.reduce((s,p)=>s+p.cost,0)); purchaseCost += cost; revenue += sales;
  daily.push({ date:day, orders:orders.length, syntheticOrders:orders.filter((o)=>o.source==='synthetic').length,
    sales:money(sales), cashSales:money(cash), expectedCash:money(1000+cash), actualCash:money(1000+cash), cashVariance:0, purchaseCost:cost, batches:purchases });
}
// One positive closing batch per ingredient; all earlier simulated batches are zero.
const closing = ingredients.map(([name,unit,threshold,,cost])=>{
  const portions=products.flatMap((p)=>p[3]).flatMap((v)=>v[2]).filter((r)=>r[1]===name).map((r)=>r[0]);
  const quantity=units(Math.max(threshold*1.5,3*Math.max(0,...portions)));
  return {name,unit,quantity,remaining:quantity,cost:money(quantity*cost),consumed:consumption.get(name)||0};
});
const summary = { ...assumptions, catalogFingerprint: fingerprint, from:START,through,days:days.length,orders:totalOrders,syntheticOrders:synthetic,
  averageSyntheticOrdersPerDay:synthetic/days.length,actualReceiptSamples:samples,units:itemUnits,averageItemsPerSyntheticOrder:(itemUnits-sampleUnits)/synthetic,
  revenue:money(revenue),historicalPurchaseCost:money(purchaseCost),closingStockCost:money(closing.reduce((s,b)=>s+b.cost,0)),closingBatches:closing.length,
  products:products.length,variants:catalog.size, databaseTouched:false };
await mkdir(output,{recursive:true});
await writeFile(`${output}/sales.csv`,csv.join('\n')+'\n');
await writeFile(`${output}/baskets.jsonl`,baskets.join('\n')+'\n');
await writeFile(`${output}/operations.json`,JSON.stringify({daily,closing},null,2));
await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
