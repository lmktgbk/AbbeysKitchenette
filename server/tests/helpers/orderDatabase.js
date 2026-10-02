// This double verifies transaction boundaries and rollback. It does not emulate
// PostgreSQL's row-lock scheduling; that requires a dedicated database suite.
export function createOrderDatabase() {
  const db = { state: {}, failCancellation: false };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) =>
    value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value);
  const copy = row => row ? structuredClone(row) : null;
  db.order = {
    async findUnique({ where }) {
      const row = copy(db.state.orders.find(row => matches(row, where)));
      if (row) row.items = copy(db.state.items.filter(item => item.orderId === row.orderId && item.removedAt === null));
      return row;
    },
    async findFirst({ where }) { return this.findUnique({ where }); },
    async create({ data }) {
      const { items, ...fields } = data;
      const row = { orderId: `test-order-${++db.state.sequence}`, createdAt: new Date(), ...fields };
      db.state.orders.push(row);
      await db.orderItem.createMany({ data: items.create.map(item => ({ orderId: row.orderId, ...item })) });
      return copy(row);
    },
    async updateMany({ where, data }) {
      const rows = db.state.orders.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    },
    async update({ where, data }) {
      const row = db.state.orders.find(row => matches(row, where));
      if (!row) throw new Error("Order missing");
      Object.assign(row, data);
      return copy(row);
    },
  };
  db.orderItem = {
    async createMany({ data }) { data.forEach(item => db.state.items.push({ orderItemId: ++db.state.sequence, removedAt: null, isPrepared: false, ...item })); return { count: data.length }; },
    async deleteMany({ where }) { db.state.items = db.state.items.filter(row => !matches(row, where)); },
    async findUnique({ where }) { return copy(db.state.items.find(row => matches(row, where))); },
    async findMany({ where }) { return copy(db.state.items.filter(row => matches(row, where))); },
    async updateMany({ where, data }) {
      const rows = db.state.items.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    },
  };
  db.orderIngredientDeduction = { async findMany() { return []; } };
  db.orderCancellation = { async create({ data }) {
    if (db.failCancellation) throw new Error("Injected cancellation failure");
    db.state.cancellations.push(copy(data));
    return copy(data);
  } };
  db.paymentRefund = { async upsert({ create }) { db.state.refunds.push(copy(create)); return copy(create); } };
  db.receipt = { async upsert({ create }) {
    if (db.failReceipt) throw new Error("Injected receipt failure");
    db.state.receipts.push(copy(create));
    return copy(create);
  } };
  db.orderRequest = {
    async findUnique({ where }) { return copy(db.state.requests.find(row => matches(row, where.scope_key))); },
    async createMany({ data }) {
      if (db.state.requests.some(row => row.scope === data.scope && row.key === data.key)) return { count: 0 };
      db.state.requests.push({ ...data, response: null });
      return { count: 1 };
    },
    async update({ where, data }) {
      if (db.failRequestResult) throw new Error("Injected request result failure");
      const row = db.state.requests.find(row => matches(row, where.scope_key));
      Object.assign(row, copy(data));
      return copy(row);
    },
  };
  db.shift = {
    async findUnique({ where }) { return copy(db.state.shifts.find(row => matches(row, where))); },
    async updateMany({ where, data }) {
      const rows = db.state.shifts.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    },
  };
  db.$queryRawUnsafe = async () => [{ day: "2026-10-03" }];
  db.$queryRaw = async (sql, ...values) => {
    const query = sql.join("?");
    const id = values[0];
    if (query.includes("FROM shifts")) {
      const row = db.state.shifts.find(row => query.includes("opened_by =") ? row.openedBy === id && row.status === "open" : row.shiftId === id);
      return row ? [{ shift_id: row.shiftId, status: row.status }] : [];
    }
    if (query.includes("INSERT INTO order_counters")) return [{ counter: ++db.state.counter }];
    if (query.includes("INSERT INTO orders")) {
      const row = { orderId: id, orderNumber: values[1], status: "pending", createdAt: new Date() };
      db.state.orders.push(row);
      return [{ created_at: row.createdAt }];
    }
    const row = db.state.orders.find(row => row.orderId === id);
    return row ? [{ order_id: id, status: row.status }] : [];
  };
  db.$executeRaw = async (_sql, data, orderId) => {
    const rows = JSON.parse(data);
    let count = 0;
    for (const priced of rows) {
      const item = db.state.items.find(item => item.orderId === orderId && item.orderItemId === priced.order_item_id && item.removedAt === null);
      if (!item) continue;
      Object.assign(item, { unitPrice: priced.unit_price, subtotal: priced.subtotal, discountType: priced.discount_type, discountPercent: priced.discount_percent, discountAmount: priced.discount_amount, discountLabel: priced.discount_label });
      count++;
      if (db.failLine && count === 1) throw new Error("Injected line failure");
    }
    return count;
  };
  let queue = Promise.resolve();
  db.$transaction = async callback => {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    const before = structuredClone(db.state);
    try { return await callback(db); }
    catch (error) { db.state = before; throw error; }
    finally { release(); }
  };
  db.reset = (orders, items) => {
    db.state = { orders: copy(orders), items: copy(items), cancellations: [], refunds: [], restores: 0, requests: [], receipts: [], shifts: [], sequence: 10, counter: 0, deductions: [] };
    db.failCancellation = false;
    db.failReceipt = false;
    db.failLine = false;
    db.failRequestResult = false;
  };
  return db;
}
