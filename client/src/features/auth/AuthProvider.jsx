/**
 * AuthProvider — session restore via TanStack Query (Rule of Thumb: /auth/me is API data).
 * WHY Query instead of a raw fetch in useEffect: dedupes StrictMode double-mount,
 * caches ["auth","me"] for Devtools, and keeps retry/stale semantics in one place.
 * Syncs into Zustand authStore (global UI: user/loading) for ProtectedRoute/PublicRoute guards.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import useAuthStore from "./authStore";
import { getMeRequest } from "./api";
export default function AuthProvider({ children }) {
    const setUser = useAuthStore((state) => state.setUser);

    // httpOnly cookie session — no token in JS. retry:false so a logged-out cold load
    // redirects fast instead of retrying a 401.
    const { data, isSuccess, isError } = useQuery({
        queryKey: ["auth", "me"],
        queryFn: getMeRequest,
        retry: false,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (isSuccess) setUser(data.data.user);
        else if (isError) setUser(null);
    }, [data, isSuccess, isError, setUser]);

    return children;
}