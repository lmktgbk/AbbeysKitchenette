import prisma, { Prisma } from "../../config/prisma.js";

// Escape LIKE wildcards so user input is matched literally.
function escapeLike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const auditLogRepository = {
  async create({ userId, action, targetType, targetId, details }) {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details: details || undefined,
      },
    });
  },

  async findMany({ page = 1, limit = 50, userId, action, actions, targetType, startDate, endDate, search }) {
    const where = {};

    if (userId) where.userId = userId;
    // Singular `action` (back-compat) plus plural `actions` CSV/array for
    // group filtering — applied server-side so pagination counts are correct.
    const actionList = [
      ...(action ? [action] : []),
      ...(Array.isArray(actions) ? actions : String(actions || "").split(",").filter(Boolean)),
    ];
    const uniqueActions = [...new Set(actionList)];
    if (uniqueActions.length === 1) where.action = uniqueActions[0];
    else if (uniqueActions.length > 1) where.action = { in: uniqueActions };
    if (targetType) where.targetType = targetType;

    // Inclusive Manila calendar days: YYYY-MM-DD is interpreted as Asia/Manila
    // (the UI groups/displays in Manila), tz-independent. Full ISO datetimes
    // fall back to plain Date parsing.
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const manilaStart = (s) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000);
    };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = DAY_RE.test(startDate)
          ? manilaStart(startDate)
          : new Date(startDate);
      }
      if (endDate) {
        if (DAY_RE.test(endDate)) {
          const [y, m, d] = endDate.split("-").map(Number);
          // Start of the NEXT Manila day = exclusive upper bound (full end day included).
          where.createdAt.lt = new Date(Date.UTC(y, m - 1, d + 1) - 8 * 3600 * 1000);
        } else {
          where.createdAt.lte = new Date(endDate);
        }
      }
    }

    if (search) {
      // Full-text-ish search needs details-JSON + actor name/email, which the
      // Prisma query builder can't express (Json string_contains only matches
      // whole string values, and relation filters can't join the actor here
      // alongside the OR). Route searched queries through parameterized raw
      // SQL so pagination counts stay consistent with the page contents.
      return findManySearched({ page, limit, userId, action, actions, targetType, startDate, endDate, search });
    }

    const skip = (page - 1) * limit;

    const [logs, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  },
};

/**
 * Searched audit-log listing via parameterized raw SQL.
 *
 * Extends the match surface to details-JSON (serialized text) and the
 * actor's name/email via a users join — both inexpressible in the Prisma
 * query builder — while honoring the same filters/date handling as findMany.
 */
async function findManySearched({ page = 1, limit = 50, userId, action, actions, targetType, startDate, endDate, search }) {
  const actionList = [
    ...(action ? [action] : []),
    ...(Array.isArray(actions) ? actions : String(actions || "").split(",").filter(Boolean)),
  ];
  const uniqueActions = [...new Set(actionList)];

  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const manilaStart = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000);
  };
  let gte = null;
  let lt = null;
  let lte = null;
  if (startDate) {
    gte = DAY_RE.test(startDate) ? manilaStart(startDate) : new Date(startDate);
  }
  if (endDate) {
    if (DAY_RE.test(endDate)) {
      const [y, m, d] = endDate.split("-").map(Number);
      lt = new Date(Date.UTC(y, m - 1, d + 1) - 8 * 3600 * 1000);
    } else {
      lte = new Date(endDate);
    }
  }

  const pattern = `%${escapeLike(search)}%`;
  const conds = [];
  if (userId) conds.push(Prisma.sql`a."userId" = ${userId}`);
  if (uniqueActions.length === 1) conds.push(Prisma.sql`a."action" = ${uniqueActions[0]}`);
  else if (uniqueActions.length > 1) conds.push(Prisma.sql`a."action" IN (${Prisma.join(uniqueActions)})`);
  if (targetType) conds.push(Prisma.sql`a."targetType" = ${targetType}`);
  if (gte) conds.push(Prisma.sql`a."createdAt" >= ${gte}`);
  if (lt) conds.push(Prisma.sql`a."createdAt" < ${lt}`);
  else if (lte) conds.push(Prisma.sql`a."createdAt" <= ${lte}`);
  conds.push(Prisma.sql`(
    a."action" ILIKE ${pattern} ESCAPE '\\'
    OR a."targetType" ILIKE ${pattern} ESCAPE '\\'
    OR a."targetId" ILIKE ${pattern} ESCAPE '\\'
    OR a."details"::text ILIKE ${pattern} ESCAPE '\\'
    OR u."name" ILIKE ${pattern} ESCAPE '\\'
    OR u."email" ILIKE ${pattern} ESCAPE '\\'
  )`);
  const whereSql = Prisma.join(conds, " AND ");

  const skip = (page - 1) * limit;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT a."id", a."userId", a."action", a."targetType", a."targetId",
             a."details", a."createdAt",
             u."id" AS "u_id", u."name" AS "u_name", u."email" AS "u_email", u."role" AS "u_role"
      FROM "audit_logs" a LEFT JOIN "User" u ON u."id" = a."userId"
      WHERE ${whereSql}
      ORDER BY a."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
    prisma.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "audit_logs" a LEFT JOIN "User" u ON u."id" = a."userId" WHERE ${whereSql}`,
  ]);

  const totalItems = countRows[0]?.count ?? 0;
  const logs = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    details: r.details,
    createdAt: r.createdAt,
    user: r.u_id ? { id: r.u_id, name: r.u_name, email: r.u_email, role: r.u_role } : null,
  }));

  return {
    logs,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}
