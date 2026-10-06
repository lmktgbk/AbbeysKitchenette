/** Independently reconcile exported orders against recipe purchases and shift cash. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { products } from "../server/prisma/demo/catalog.js";
const directory = new URL("./forecast-demo-dataset/", import.meta.url);
const baskets=(await readFile(new URL('baskets.jsonl',directory),'utf8')).trim().split('\n').map(JSON.parse);
const operations=JSON.parse(await readFile(new URL('operations.json',directory),'utf8'));
const summary=JSON.parse(await readFile(new URL('summary.json',directory),'utf8'));
const variants=products.flatMap((p)=>p[3]);
const expected=new Map(); let receipts=0, revenue=0, count=0;
for(const basket of baskets){
  if(basket.source==='receipt')receipts++;
  let subtotal=0;
  for(const item of basket.items){
    const [size,price,recipe]=variants[item.variant_id-1];
    assert.equal(item.price,price); assert.ok(size && item.quantity>0);
    subtotal+=price*item.quantity; count+=item.quantity;
    const day=expected.get(basket.date)||{cash:0,sales:0,stock:new Map()};
    for(const [quantity,name] of recipe)day.stock.set(name,(day.stock.get(name)||0)+quantity*item.quantity);
    expected.set(basket.date,day);
  }
  assert.equal(basket.total,subtotal); assert.equal(basket.paid-basket.change,basket.total);
  const day=expected.get(basket.date);day.sales+=subtotal;if(basket.payment==='cash')day.cash+=subtotal;
  revenue+=subtotal;
}
for(const day of operations.daily){
  const total=expected.get(day.date);
  assert.equal(day.sales,total.sales);assert.equal(day.cashSales,total.cash);
  assert.equal(day.expectedCash,1000+total.cash);assert.equal(day.actualCash,day.expectedCash);
  assert.equal(day.batches.length,total.stock.size);
  for(const batch of day.batches){
    assert.ok(Math.abs(batch.quantity-total.stock.get(batch.name))<.001);
    assert.equal(batch.remaining,0);
  }
}
assert.equal(receipts,37);assert.equal(summary.orders,baskets.length);assert.equal(summary.revenue,revenue);assert.equal(summary.units,count);
assert.equal(new Set(operations.closing.map((b)=>b.name)).size,145);
assert.ok(operations.closing.every((b)=>b.remaining===b.quantity && b.quantity>0));
console.log('PASS: 37 receipt samples, order/payment totals, daily recipe purchase conservation, cash reconciliation, 145 positive closing batches');
