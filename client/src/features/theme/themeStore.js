import { create } from "zustand";

/**
 * Theme Store
 * Manages dark/light mode preference.
 * Persists to localStorage and applies class to <html> element.
 */
const useThemeStore = create((set) => ({
  // Initialize from localStorage, default to light
  theme: localStorage.getItem("theme") || "light",

  // Toggle between light and dark, persist to localStorage in main.jsx
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(next);
      return { theme: next };
    }),
}));

export default useThemeStore;
