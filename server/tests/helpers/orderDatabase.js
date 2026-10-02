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
  db.$queryRaw = async (_sql, id) => {
    const row = db.state.orders.find(row => row.orderId === id);
    return row ? [{ order_id: id, status: row.status }] : [];
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
    db.state = { orders: copy(orders), items: copy(items), cancellations: [], refunds: [], restores: 0 };
    db.failCancellation = false;
  };
  return db;
}
