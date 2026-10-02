import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { orderRepository } from "../src/modules/orders/order.repository.js";

// Called only inside verify-baseline's disposable schema and outer transaction.
// All fixtures and mutation queries disappear when that transaction rolls back.
export async function verifyConsumption(client) {
  const user = randomUUID(), ingredient = randomUUID(), product = randomUUID();
  const first = randomUUID(), second = randomUUID();
  await client.query('INSERT INTO "User"(id,name,email,"passwordHash","updatedAt") VALUES($1,\'Fixture\',\'fixture@example.invalid\',\'not-a-login-hash\',now())', [user]);
  await client.query("INSERT INTO ingredients(ingredient_id,ingredient_name,unit,updated_at) VALUES($1,'Fixture','g',now())", [ingredient]);
  const category = (await client.query("INSERT INTO categories(category_name,updated_at) VALUES('Fixture',now()) RETURNING category_id")).rows[0].category_id;
  const subcategory = (await client.query("INSERT INTO subcategories(category_id,subcategory_name,updated_at) VALUES($1,'Fixture',now()) RETURNING subcategory_id", [category])).rows[0].subcategory_id;
  await client.query("INSERT INTO products(product_id,subcategory_id,product_name,updated_at) VALUES($1,$2,'Fixture',now())", [product, subcategory]);
  const variant = (await client.query("INSERT INTO product_variants(product_id,size_name,price) VALUES($1,'Fixture',100) RETURNING variant_id", [product])).rows[0].variant_id;
  const batch = (await client.query("INSERT INTO restock_batches(ingredient_id,restocked_by,quantity_added,quantity_left,cost_per_unit,total_cost) VALUES($1,$2,10,6,2,20) RETURNING restock_id", [ingredient, user])).rows[0].restock_id;
  for (const [index, order] of [first, second].entries()) {
    await client.query("INSERT INTO orders(order_id,order_number,order_date,customer_name,table_number,order_source,status,updated_at) VALUES($1,$2,current_date,'Fixture','1','walk_in','preparing',now())", [order, index + 1]);
  }
  const item = (await client.query("INSERT INTO order_items(order_id,product_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,1,100) RETURNING order_item_id", [first, product, variant])).rows[0].order_item_id;
  const deduction = (await client.query("INSERT INTO order_ingredient_deductions(order_id,order_item_id,ingredient_id,restock_batch_id,quantity_deducted,cost_per_unit) VALUES($1,$2,$3,$4,4,2) RETURNING id", [first, item, ingredient, batch])).rows[0].id;
  const tx = {
    async $executeRaw(parts, ...values) {
      const sql = parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
      return (await client.query(sql, values)).rowCount;
    },
    async $executeRawUnsafe(sql, ...values) { return (await client.query(sql, values)).rowCount; },
  };
  const rejects = async (sql, values, expectedCode) => {
    await client.query("SAVEPOINT invalid_consumption");
    let code;
    try { await client.query(sql, values); } catch (error) { code = error.code; }
    await client.query("ROLLBACK TO SAVEPOINT invalid_consumption");
    assert.equal(code, expectedCode);
  };
  await rejects("INSERT INTO order_ingredient_deductions(order_id,order_item_id,ingredient_id,restock_batch_id,quantity_deducted) VALUES($1,$2,$3,$4,1)", [second, item, ingredient, batch], "23503");
  await rejects("UPDATE order_ingredient_deductions SET quantity_restored=5,reversed_at=now() WHERE id=$1", [deduction], "23514");
  await rejects("UPDATE order_ingredient_deductions SET quantity_restored=1 WHERE id=$1", [deduction], "23514");
  const settlement = [{ id: deduction, quantityRestored: 2.25, quantityLost: 1.75 }];
  await client.query("SAVEPOINT rollback_settlement");
  assert.equal(await orderRepository.settleDeductions(first, settlement, user, tx), 1);
  assert.equal(await orderRepository.bulkRestoreBatches([{ restockId: batch, quantity: 2.25, version: 0 }], tx), 1);
  assert.equal(await orderRepository.settleDeductions(first, settlement, user, tx), 0);
  assert.equal(await orderRepository.bulkRestoreBatches([{ restockId: batch, quantity: 2.25, version: 0 }], tx), 0);
  const row = (await client.query("SELECT quantity_restored,quantity_lost,quantity_deducted FROM order_ingredient_deductions WHERE id=$1", [deduction])).rows[0];
  assert.deepEqual(row, { quantity_restored: "2.250", quantity_lost: "1.750", quantity_deducted: "4.000" });
  assert.equal((await client.query("SELECT quantity_left FROM restock_batches WHERE restock_id=$1", [batch])).rows[0].quantity_left, "8.250");
  await client.query("ROLLBACK TO SAVEPOINT rollback_settlement");
  assert.equal((await client.query("SELECT reversed_at FROM order_ingredient_deductions WHERE id=$1", [deduction])).rows[0].reversed_at, null);
  assert.equal((await client.query("SELECT quantity_left FROM restock_batches WHERE restock_id=$1", [batch])).rows[0].quantity_left, "6.000");
  console.log("PostgreSQL item/order FK, quantity checks, guarded settlement, stock version guard and rollback verified in disposable schema.");
}
