export const guestKeys = {
  menus: ["guest", "menu"],
  menu: (params = {}) => ["guest", "menu", params],
  order: token => ["guest", "order", token],
};
