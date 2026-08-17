import { useEffect } from "react";
import useAuthStore from "./authStore";
import { getMeRequest } from "./api";

/**
 * AuthProvider
 *
 * Checks if the user is logged in on mount (via httpOnly cookie).
 * Uses Zustand to store user state — no React Context provider needed.
 */
export default function AuthProvider({ children }) {
    const setUser = useAuthStore((state) => state.setUser);

    useEffect(() => {
        getMeRequest()
            .then((res) => setUser(res.data.user))
            .catch(() => setUser(null));
    }, [setUser]);

    return children;
}