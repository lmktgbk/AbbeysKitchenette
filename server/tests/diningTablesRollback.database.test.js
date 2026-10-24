import { describe, it, expect } from "vitest";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";

describe.skipIf(process.env.TABLE_ROLLBACK_DB_CHECK !== "1")("Table schema reversal", () => {
  it("preserves historical order labels and restores legacy settings in an isolated schema", async () => {
    const fixture = await isolatedPostgres("table_rollback_check", async (migration, client) => {
      if (migration !== "20261024010000_revert_stable_dining_tables") return;
      await client.query(`INSERT INTO system_settings (id, dining_tables, "updatedAt")
        VALUES (1, $1::jsonb, now())`, [JSON.stringify({ tables: [
        { id: "t1", number: 1, label: "Gazebo", enabled: true },
        { id: "t3", number: 3, label: "", enabled: false },
      ], takeoutEnabled: true })]);
      await client.query(`INSERT INTO orders
        (order_id, order_number, order_date, customer_name, table_number, table_id, order_source, updated_at)
        VALUES ('11111111-1111-4111-a111-111111111111', 1, '2026-10-23', 'Fixture', 'Table 1 · Gazebo', 't1', 'walk_in', now())`);
    });
    try {
      const columns = await fixture.db.$queryRaw`SELECT column_name, character_maximum_length
        FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'orders' AND column_name IN ('table_id', 'table_number')`;
      expect(columns).toEqual([{ column_name: "table_number", character_maximum_length: 20 }]);
      const order = await fixture.db.order.findFirst();
      expect(order.tableNumber).toBe("Table 1 · Gazebo");
      const settings = await fixture.db.systemSettings.findUnique({ where: { id: 1 } });
      expect(settings.diningTables).toEqual({ tables: [
        { id: "t1", label: "Gazebo", enabled: true },
        { id: "t3", label: "Table 3", enabled: false },
      ], takeoutEnabled: true });
    } finally {
      await fixture.cleanup();
    }
  }, 180000);
});
