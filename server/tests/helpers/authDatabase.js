// Transactional test double. PostgreSQL lock/isolation semantics require a separate DB suite.
export function createAuthDatabase() {
  const db = { state: {}, failPasswordWrite: false };
  const names = ["user", "otpCode", "passwordResetToken"];
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("gt" in value) return row[key] > value.gt;
        if ("lt" in value) return row[key] < value.lt;
      }
      return row[key] === value;
    });
  }
  function project(row, select) {
    if (!row) return null;
    return structuredClone(select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row);
  }
  for (const name of names) {
    const rows = () => db.state[name];
    const mutate = (row, data) => {
      if (db.failPasswordWrite && data.passwordHash) throw new Error("Injected password write failure");
      for (const [key, value] of Object.entries(data)) {
        row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
      }
      return row;
    };
    db[name] = {
      async findUnique({ where, select }) { return project(rows().find(r => matches(r, where)), select); },
      async findFirst({ where, orderBy }) {
        const result = rows().filter(r => matches(r, where));
        if (orderBy?.createdAt) result.sort((a, b) => b.createdAt - a.createdAt);
        return project(result[0]);
      },
      async create({ data, select }) {
        const row = { id: ++db.state.sequence, attempts: 0, usedAt: null, createdAt: new Date(), ...data };
        rows().push(row);
        return project(row, select);
      },
      async update({ where, data, select }) {
        const row = rows().find(r => matches(r, where));
        if (!row) throw new Error("Test record not found");
        return project(mutate(row, data), select);
      },
      async updateMany({ where, data }) {
        const found = rows().filter(r => matches(r, where));
        found.forEach(row => mutate(row, data));
        return { count: found.length };
      },
      async deleteMany({ where }) {
        const before = rows().length;
        db.state[name] = rows().filter(r => !matches(r, where));
        return { count: before - db.state[name].length };
      },
    };
  }
  let queue = Promise.resolve();
  db.$queryRaw = async () => [];
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
  db.reset = user => {
    db.state = { user: [structuredClone(user)], otpCode: [], passwordResetToken: [], sequence: 0 };
    db.failPasswordWrite = false;
  };
  return db;
}
