import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { formatStoreHours } from "../formatHours";

export default function Footer({ settings = {} }) {
    const currentYear = new Date().getFullYear();
    const displayName = settings.storeName || "Abbey's Kitchenette";
    const phone = settings.storePhone || "0929 781 1212";
    const email = settings.storeEmail || "maryrosemendoza78@yahoo.com";
    const address = settings.storeAddress || "Robledo Compound, Bulacnin, Lipa City";
    const hours = formatStoreHours(settings.storeHours);

    const phoneDigits = phone.replace(/\D/g, "");

    const quickLinks = [
        { label: "Home",      href: "#home" },
        { label: "About Us",  href: "#about" },
        { label: "Menu",      href: "#menu" },
        { label: "Location",  href: "#location" },
        { label: "Contact",   href: "#contact" },
    ];

    const handleNavClick = (e, href) => {
        e.preventDefault();
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <footer className="landing-footer">
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
                    {/* Social Links */}
                    <div className="footer-socials" aria-label="Social media links">
                        <a
                            href="https://www.facebook.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="footer-social-link"
                            aria-label="Facebook"
                        >
                            <Icon name="users" size={16} />
                        </a>
                        <a
                            href={`mailto:${email}`}
                            className="footer-social-link"
                            aria-label="Email"
                        >
                            <Icon name="mail" size={16} />
                        </a>
                        <a
                            href={`tel:${phoneDigits}`}
                            className="footer-social-link"
                            aria-label="Call us"
                        >
                            <Icon name="phone" size={16} />
                        </a>
                    </div>
                </div>

                {/* Quick Links */}
                <div>
                    <h4 className="footer-heading">Quick Links</h4>
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
                            Order Online
                        </Link>
                    </div>
                </div>

                {/* Contact */}
                <div>
                    <h4 className="footer-heading">Contact</h4>
                    <div className="footer-links">
                        <span className="footer-link">{address}</span>
                        <a href={`tel:${phoneDigits}`} className="footer-link">{phone}</a>
                        <a href={`mailto:${email}`} className="footer-link">
                            {email}
                        </a>
                        <span className="footer-link">{hours}</span>
                    </div>
                </div>
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
                    {/* Staff login — intentionally subtle */}
                    <Link to="/login" className="footer-staff-login">
                        Staff Login
                    </Link>
                </div>
            </div>
        </footer>
    );
}
