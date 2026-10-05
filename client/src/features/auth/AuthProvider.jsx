/**
 * Restore the public user profile through the auth query and mirror it into
 * Zustand for route rendering. The browser sends the HttpOnly cookie; this
 * provider neither reads credentials nor establishes backend permission.
 * Auth results stay fresh until explicitly invalidated or replaced by session
 * helpers. Every restore error currently publishes signed-out UI state.
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