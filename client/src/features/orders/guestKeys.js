/**
 * Public menu and tracking cache identities shared by queries and invalidation.
 * menus is the prefix for every filtered catalog; order separates private tracking tokens.
 * Token keys remain browser cache identifiers, not a substitute for server access checks.
 */
export const guestKeys = {
  menus: ["guest", "menu"],
  menu: (params = {}) => ["guest", "menu", params],
  order: token => ["guest", "order", token],
};
