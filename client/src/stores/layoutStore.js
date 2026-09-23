/**
 * layoutStore — global sidebar UI only (Zustand).
 * WHY: collapsed/mobileOpen are needed by both AdminLayout and Header.
 * Viewport (isMobile) is NOT here — it is browser-only derived state, owned by
 * useIsMobile() at the smallest scope (see src/hooks/useIsMobile.js).
 * State: Zustand { collapsed, mobileOpen } persisted via localStorage key "sidebar-collapsed".
 */
import { create } from "zustand";

function getInitialCollapsed() {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebar-collapsed") : null;
    if (saved !== null) return saved === "true";
  } catch {
    // Private-mode storage denial — fall through to viewport default.
  }
  if (typeof window !== "undefined") return window.innerWidth < 1024;
  return false;
}

const useLayoutStore = create((set) => ({
  collapsed: getInitialCollapsed(),
  mobileOpen: false,

  toggleCollapsed: () =>
    set((s) => {
      const next = !s.collapsed;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {
        // Non-fatal: collapse still applies for this session.
      }
      return { collapsed: next };
    }),

  setMobileOpen: (mobileOpen) => set({ mobileOpen }),
  closeMobile: () => set({ mobileOpen: false }),
}));

export default useLayoutStore;
