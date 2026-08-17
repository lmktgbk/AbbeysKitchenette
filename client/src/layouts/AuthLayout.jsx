import { Outlet } from "react-router-dom";

export default function AuthLayout() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md animate-in fade-in-0 duration-300">
                <Outlet />
            </div>
        </div>
    );
}
