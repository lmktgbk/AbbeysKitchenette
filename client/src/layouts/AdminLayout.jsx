import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./admin/Sidebar";
import Header from "./admin/Header";
import Icon from "@/components/ui/icon";
import useLayoutStore from "@/stores/layoutStore";

export default function AdminLayout() {
    const mobileOpen = useLayoutStore((s) => s.mobileOpen);
    const isMobile = useLayoutStore((s) => s.isMobile);
    const setMobileOpen = useLayoutStore((s) => s.setMobileOpen);
    const closeMobile = useLayoutStore((s) => s.closeMobile);
    const setIsMobile = useLayoutStore((s) => s.setIsMobile);

    useEffect(() => {
        function handleResize() {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false);
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [setIsMobile, setMobileOpen]);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {isMobile && mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 transition-opacity"
                    onClick={closeMobile}
                />
            )}

            {isMobile ? (
                <div
                    className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${
                        mobileOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="relative h-full">
                        <button
                            onClick={closeMobile}
                            className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Close sidebar"
                        >
                            <Icon name="x" size={20} />
                        </button>
                        <Sidebar />
                    </div>
                </div>
            ) : (
                <Sidebar />
            )}

            <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
