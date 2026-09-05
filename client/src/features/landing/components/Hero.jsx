import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";

/**
 * Hero
 * Full-screen hero section with parallax background image,
 * animated headline, stat bar, and dual CTA buttons:
 *  1. "Order Online" → /order (primary)
 *  2. "View Our Menu" → #menu (secondary outline)
 */
export default function Hero() {
    const handleMenuClick = (e) => {
        e.preventDefault();
        const el = document.querySelector("#menu");
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    const handleScrollDown = (e) => {
        e.preventDefault();
        const el = document.querySelector("#about");
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <section id="home" className="hero-section">
            {/* Background Image */}
            <div
                className="hero-bg"
                style={{ backgroundImage: "url(/landing/hero_cafe_bg.jpg)" }}
            />

            {/* Dark Overlay */}
            <div className="hero-overlay" />

            {/* Content */}
            <div className="hero-content">
                {/* Badge */}
                <div className="hero-badge">
                    <Icon name="sparkles" size={12} />
                    Restaurant Cafe · Lipa City, Batangas
                </div>

                <h1 className="hero-title">
                    Abbey's{" "}
                    <span className="hero-title-accent">Kitchenette</span>
                </h1>

                <p className="hero-tagline">
                    A restaurant cafe built in love and perseverance.
                    <br className="hidden sm:block" />
                    Best tasting drinks and mouth-watering dishes.
                </p>

                {/* CTA Buttons */}
                <div className="hero-ctas">
                    <Link to="/order" className="hero-cta">
                        <Icon name="shoppingBag" size={18} />
                        Order Online
                    </Link>
                    <a
                        href="#menu"
                        className="hero-cta-outline"
                        onClick={handleMenuClick}
                    >
                        View Our Menu
                        <Icon name="arrowDown" size={18} />
                    </a>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="hero-stats" aria-label="Restaurant highlights">
                <div className="hero-stat">
                    <div className="hero-stat-value">500+</div>
                    <div className="hero-stat-label">Happy Diners</div>
                </div>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                    <div className="hero-stat-value">30+</div>
                    <div className="hero-stat-label">Menu Items</div>
                </div>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                    <div className="hero-stat-value">5★</div>
                    <div className="hero-stat-label">Customer Rating</div>
                </div>
            </div>

            {/* Scroll Indicator */}
            <a href="#about" className="hero-scroll" onClick={handleScrollDown}>
                <span>Scroll</span>
                <Icon name="chevronDown" size={22} data-scroll-icon />
            </a>
        </section>
    );
}
