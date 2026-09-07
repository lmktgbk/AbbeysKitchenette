import { create } from "zustand";

const getInitialCollapsed = () => {
  const saved = localStorage.getItem("sidebar-collapsed");
  if (saved !== null) return saved === "true";
  return window.innerWidth < 1024;
};

const useLayoutStore = create((set) => ({
  collapsed: getInitialCollapsed(),
  mobileOpen: false,
  isMobile: window.innerWidth < 768,

  toggleCollapsed: () =>
    set((s) => {
      const next = !s.collapsed;
      localStorage.setItem("sidebar-collapsed", String(next));
      return { collapsed: next };
    }),

  setMobileOpen: (mobileOpen) => set({ mobileOpen }),
  closeMobile: () => set({ mobileOpen: false }),
  setIsMobile: (isMobile) => set({ isMobile }),
}));

export default useLayoutStore;
