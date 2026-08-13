import Icon from "@/components/ui/icon";

/**
 * Hero
 * Full-screen hero section with background image,
 * headline, tagline, and CTA button.
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
                <h1 className="hero-title">Abbey's Kitchenette</h1>
                <p className="hero-tagline">
                    A restaurant cafe built in love and perseverance.
                    <br className="hidden sm:block" />
                    Best tasting drinks and mouth-watering dishes.
                </p>
                <a href="#menu" className="hero-cta" onClick={handleMenuClick}>
                    View Our Menu
                    <Icon name="arrowDown" size={18} />
                </a>
            </div>

            {/* Scroll Indicator */}
            <a href="#about" className="hero-scroll" onClick={handleScrollDown}>
                <Icon name="chevronDown" size={24} />
            </a>
        </section>
    );
}
