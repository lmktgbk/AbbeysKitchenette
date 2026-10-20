import { Link } from "react-router-dom";

export default function Footer({ settings = {} }) {
    const currentYear = new Date().getFullYear();
    const displayName = settings.storeName || "Abbey's Kitchenette";

    const quickLinks = [
        { label: "Home",      href: "#home" },
        { label: "About Us",  href: "#about" },
        { label: "Menu",      href: "#menu" },
        { label: "Gallery",  href: "#gallery" },
        { label: "Visit & Contact", href: "#location" },
    ];

    const handleNavClick = (e, href) => {
        e.preventDefault();
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <footer className="landing-footer compact-footer">
            <div className="footer-grid">
                {/* Brand */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <img
                            src="/favicon.png"
                            alt={displayName}
                            style={{ width: 36, height: 36, borderRadius: "999px", objectFit: "cover" }}
                        />
                        <span
                            style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: "1.0625rem",
                                fontWeight: 700,
                                color: "#fff",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            {displayName}
                        </span>
                    </div>
                    <p className="footer-brand-desc">
                        A restaurant cafe built in love and perseverance.
                        Best tasting drinks and mouth-watering dishes in Lipa City.
                    </p>
                </div>

                {/* Quick Links */}
                <nav aria-label="Footer navigation">
                    <h4 className="footer-heading">Explore Abbey's</h4>
                    <div className="footer-links">
                        {quickLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="footer-link"
                                onClick={(e) => handleNavClick(e, link.href)}
                            >
                                {link.label}
                            </a>
                        ))}
                        <Link to="/order" className="footer-link">
                            Open Kiosk
                        </Link>
                    </div>
                </nav>

            </div>

            {/* Divider */}
            <hr className="footer-divider" />

            {/* Bottom Bar */}
            <div className="footer-bottom">
                <span>
                    &copy; {currentYear} {displayName}. All rights reserved.
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <Link to="/privacy-policy" className="footer-link">Privacy Policy</Link>
                    <Link to="/terms-of-service" className="footer-link">Terms of Service</Link>
                </div>
            </div>
        </footer>
    );
}
