import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";

/**
 * Navbar
 * Fixed top navigation bar for the landing page.
 * Transparent on hero, solid on scroll.
 * Mobile: hamburger menu.
 */
export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const links = [
        { label: "Home", href: "#home" },
        { label: "About", href: "#about" },
        { label: "Menu", href: "#menu" },
        { label: "Location", href: "#location" },
        { label: "Contact", href: "#contact" },
    ];

    const handleNavClick = (e, href) => {
        e.preventDefault();
        setMobileOpen(false);
        const el = document.querySelector(href);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
        }
    };

    return (
        <nav className={`navbar ${scrolled ? "navbar-solid" : "navbar-transparent"}`}>
            <div className="mx-auto flex max-w-7xl items-center justify-between">
                {/* Logo */}
                <a href="#home" className="flex items-center gap-2.5" onClick={(e) => handleNavClick(e, "#home")}>
                    <img
                        src="/favicon.png"
                        alt="Abbey's Kitchenette"
                        className="h-9 w-9 rounded-full"
                    />
                    <span className="text-lg font-bold tracking-tight text-white dark:text-foreground">
                        Abbey's Kitchenette
                    </span>
                </a>

                {/* Desktop Links */}
                <div className="hidden items-center gap-8 md:flex">
                    {links.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="navbar-link"
                            onClick={(e) => handleNavClick(e, link.href)}
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                {/* Mobile Toggle */}
                <button
                    className="flex items-center justify-center rounded-lg p-2 text-white transition-colors hover:bg-white/10 md:hidden"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label="Toggle menu"
                >
                    <Icon name={mobileOpen ? "x" : "menu"} size={22} />
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div className="absolute left-0 right-0 top-full border-b border-white/10 bg-oklch(0.15 0 0 / 0.95) backdrop-blur-lg md:hidden">
                    <div className="flex flex-col gap-1 p-4">
                        {links.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="rounded-lg px-4 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
                                onClick={(e) => handleNavClick(e, link.href)}
                            >
                                {link.label}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    );
}
