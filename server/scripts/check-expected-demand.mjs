import assert from "node:assert/strict";
import { isolatedPostgres } from "../tests/helpers/isolatedPostgres.js";
// A disposable schema proves migration compatibility without touching business rows.
const fixture = await isolatedPostgres("expected_demand", async (name, client) => {
  if (name !== "20261006120000_expected_demand") return;
  await client.query("INSERT INTO forecast_jobs (id,status) VALUES (1,'completed')");
  await client.query(`INSERT INTO forecast_results (job_id,variant_id,product_name,size_name,price,category_id,daily_data,total_units) VALUES (1,1,'Legacy','Regular',130,1,'[]',3)`);
});
try {
  const legacy = await fixture.db.forecastResult.findFirst({ where: { variantId: 1 } });
  assert.equal(legacy.totalUnits, 3);
  const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(index+6).padStart(2,'0')}`, units: .49, revenue: .49*130 }));
  const saved = await fixture.db.forecastResult.create({ data: {
    jobId: 1, variantId: 2, productName: "Expected", sizeName: "Regular", price: 130,
    categoryId: 1, dailyData: days, totalUnits: 3.43, totalRevenue: 445.9,
  } });
  const read = await fixture.db.forecastResult.findUnique({ where: { id: saved.id } });
  assert.equal(read.totalUnits, 3.43);
  assert.equal(read.dailyData[0].units, .49);
  assert.ok(Math.abs(read.totalUnits-read.dailyData.reduce((sum,day)=>sum+day.units,0))<1e-12);
  console.log("PASS: all migrations, legacy count preservation, fractional Prisma/JSON round trip");
} finally { await fixture.cleanup(); }
