import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";

/**
 * Navbar
 * Fixed top navigation bar for the landing page.
 * Transparent on hero, solid (glassmorphism) on scroll.
 * Mobile: animated slide-down hamburger menu.
 * Desktop: inline "Order Online" CTA button.
 */
export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Close mobile menu on resize to desktop
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth >= 768) setMobileOpen(false);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const links = [
        { label: "Home",     href: "#home" },
        { label: "About",    href: "#about" },
        { label: "Menu",     href: "#menu" },
        { label: "Location", href: "#location" },
        { label: "Contact",  href: "#contact" },
    ];

    const handleNavClick = (e, href) => {
        e.preventDefault();
        setMobileOpen(false);
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <nav className={`navbar ${scrolled ? "navbar-solid" : "navbar-transparent"}`}>
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
                {/* Logo */}
                <a
                    href="#home"
                    className="flex items-center gap-2.5 text-decoration-none"
                    onClick={(e) => handleNavClick(e, "#home")}
                >
                    <img
                        src="/favicon.png"
                        alt="Abbey's Kitchenette"
                        className="h-9 w-9 rounded-full"
                        style={{ objectFit: "cover" }}
                    />
                    <span
                        className="navbar-brand-text"
                        style={{
                            fontFamily: "'Space Grotesk', sans-serif",
                            fontSize: "1.0625rem",
                            fontWeight: 700,
                            letterSpacing: "-0.01em",
                            color: scrolled ? "#1c1008" : "#fff",
                            transition: "color 0.28s",
                        }}
                    >
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

                {/* Desktop CTA */}
                <div className="hidden items-center gap-3 md:flex">
                    <Link to="/order" className="navbar-cta">
                        <Icon name="shoppingBag" size={16} />
                        Order Online
                    </Link>
                </div>

                {/* Mobile Toggle */}
                <button
                    className="navbar-mobile-btn md:hidden"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label="Toggle menu"
                    aria-expanded={mobileOpen}
                >
                    <Icon name={mobileOpen ? "x" : "menu"} size={22} />
                </button>
            </div>

            {/* Mobile Menu — animated slide-down */}
            {mobileOpen && (
                <div className="navbar-mobile-menu md:hidden">
                    <div className="flex flex-col">
                        {links.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="navbar-mobile-link"
                                onClick={(e) => handleNavClick(e, link.href)}
                            >
                                {link.label}
                            </a>
                        ))}
                        <Link
                            to="/order"
                            className="navbar-mobile-cta"
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon name="shoppingBag" size={16} />
                            Order Online
                        </Link>
                    </div>
                </div>
            )}
        </nav>
    );
}
