import { create } from "zustand";

/**
 * Auth Store - Global auth state
 *
 * Zustand holds the user data and provides actions to update it.
 * No provider needed — any component can import and use this directly.
 */
const useAuthStore = create((set) => ({
  //state
  user: null,
  loading: true,

  //actions
  setUser: (user) => set({ user, loading: false }),

  logout: () => set({ user: null }),
}));

export default useAuthStore;
