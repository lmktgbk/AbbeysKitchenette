/**
 * Restore the public user profile through the auth query and mirror it into
 * Zustand for route rendering. The browser sends the HttpOnly cookie; this
 * provider neither reads credentials nor establishes backend permission.
 * Auth results stay fresh until explicitly invalidated or replaced by session
 * helpers. Temporary errors preserve verified identity; cold loads remain gated.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import useAuthStore from "./authStore";
import { sessionQueryOptions, sessionRestoreUser } from "./sessionRestore";
import { getSessionEpoch } from "./session";
import SessionCheck from "./components/SessionCheck";
export default function AuthProvider({ children }) {
    const setUser = useAuthStore((state) => state.setUser);
    const user = useAuthStore((state) => state.user);

    // httpOnly cookie session — no token in JS. retry:false so a logged-out cold load
    // redirects fast instead of retrying a 401.
    const { data, isSuccess, isError, error } = useQuery(sessionQueryOptions);

    useEffect(() => {
        const restored = sessionRestoreUser({ data, isSuccess, isError, error }, getSessionEpoch());
        if (restored !== undefined) setUser(restored);
    }, [data, isSuccess, isError, error, setUser]);

    return <>{user && isError && error?.response?.status !== 401 && <SessionCheck compact />}{children}</>;
}
