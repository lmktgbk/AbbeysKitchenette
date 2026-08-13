import { Link } from "react-router-dom";

/**
 * Footer
 * Landing page footer with links, data privacy, and staff login.
 * Staff login link is subtle — not visible to regular customers.
 */
export default function Footer() {
    const currentYear = new Date().getFullYear();

    const quickLinks = [
        { label: "Home", href: "#home" },
        { label: "About", href: "#about" },
        { label: "Menu", href: "#menu" },
        { label: "Location", href: "#location" },
        { label: "Contact", href: "#contact" },
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
                    <div className="flex items-center gap-2.5">
                        <img
                            src="/favicon.png"
                            alt="Abbey's Kitchenette"
                            className="h-8 w-8 rounded-full"
                        />
                        <span className="text-lg font-bold tracking-tight text-white">
                            Abbey's Kitchenette
                        </span>
                    </div>
                    <p className="footer-brand-desc">
                        A restaurant cafe built in love and perseverance.
                        Best tasting drinks and mouth-watering dishes in Lipa City.
                    </p>
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
                    </div>
                </div>

                {/* Contact */}
                <div>
                    <h4 className="footer-heading">Contact</h4>
                    <div className="footer-links">
                        <span className="footer-link">Robledo Compound, Bulacnin, Lipa City</span>
                        <span className="footer-link">0929 781 1212</span>
                        <span className="footer-link">maryrosemendoza78@yahoo.com</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <hr className="footer-divider" />

            {/* Bottom Bar */}
            <div className="footer-bottom">
                <span>
                    &copy; {currentYear} Abbey's Kitchenette. All rights reserved.
                </span>
                <div className="flex items-center gap-4">
                    <a href="#" className="footer-link">
                        Privacy Policy
                    </a>
                    <a href="#" className="footer-link">
                        Terms of Service
                    </a>
                    <Link to="/login" className="footer-staff-login">
                        Staff Login
                    </Link>
                </div>
            </div>
        </footer>
    );
}
