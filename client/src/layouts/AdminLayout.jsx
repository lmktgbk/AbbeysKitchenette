import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./admin/Sidebar";
import Header from "./admin/Header";
import Icon from "@/components/ui/icon";

/**
 * AdminLayout — sidebar + header + content area.
 *
 * Responsive:
 *   Mobile (<768):    Header visible, sidebar as drawer overlay
 *   Tablet (768-1023): Header visible, sidebar collapsed (64px)
 *   Desktop (≥1024):  Header visible, sidebar expanded (256px)
 */
export default function AdminLayout() {
    const [collapsed, setCollapsed] = useState(() => {
        const saved = localStorage.getItem("sidebar-collapsed");
        if (saved !== null) return saved === "true";
        return window.innerWidth < 1024;
    });

    const [mobileOpen, setMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    // Track viewport size
    useEffect(() => {
        function handleResize() {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false);
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Save collapsed state to localStorage
    useEffect(() => {
        if (!isMobile) {
            localStorage.setItem("sidebar-collapsed", String(collapsed));
        }
    }, [collapsed, isMobile]);

    function handleToggleSidebar() {
        if (isMobile) {
            setMobileOpen(!mobileOpen);
        } else {
            setCollapsed(!collapsed);
        }
    }

    function handleCloseMobile() {
        setMobileOpen(false);
    }

    const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 256;

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Mobile backdrop */}
            {isMobile && mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 transition-opacity"
                    onClick={handleCloseMobile}
                />
            )}

            {/* Sidebar — mobile drawer */}
            {isMobile ? (
                <div
                    className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${
                        mobileOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="relative h-full">
                        {/* Close button */}
                        <button
                            onClick={handleCloseMobile}
                            className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Close sidebar"
                        >
                            <Icon name="x" size={20} />
                        </button>
                        <Sidebar collapsed={false} />
                    </div>
                </div>
            ) : (
                /* Sidebar — desktop/tablet */
                <Sidebar collapsed={collapsed} />
            )}

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header onToggleSidebar={handleToggleSidebar} />
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
