import Icon from "@/components/ui/icon";

/**
 * About
 * About section telling the story of Abbey's Kitchenette.
 * Two-column layout: image (left) + text (right) on desktop, stacked on mobile.
 * Uses .lp-reveal + .lp-reveal-delay-* for scroll-driven fade-up animations
 * (triggered by IntersectionObserver in LandingPage.jsx).
 */
export default function About() {
    const values = [
        { icon: "heart",    label: "Built with Love" },
        { icon: "coffee",   label: "Cozy Atmosphere" },
        { icon: "utensils", label: "Quality Food" },
        { icon: "users",    label: "Friendly Service" },
    ];

    return (
        <section id="about" className="landing-section">
            {/* Section Header */}
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Our Story</h2>
                <span className="landing-title-line" />
            </div>

            <div className="about-grid" style={{ marginTop: "3.5rem" }}>
                {/* Image */}
                <div className="lp-reveal lp-reveal-delay-1">
                    <img
                        src="/landing/diners.jpg"
                        alt="Diners enjoying food at Abbey's Kitchenette"
                        className="about-image"
                    />
                </div>

                {/* Text */}
                <div className="about-text lp-reveal lp-reveal-delay-2">
                    <p style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#d97706",
                        marginBottom: "0.5rem",
                    }}>
                        About Us
                    </p>
                    <h3>A Cafe Built in Love & Perseverance</h3>
                    <p>
                        Abbey's Kitchenette is a restaurant cafe built in love and
                        perseverance. What started as a passion project has grown into a
                        beloved dining destination in Lipa City, serving the best tasting
                        drinks and mouth-watering dishes.
                    </p>
                    <p>
                        We believe every meal should be an experience — from our carefully
                        crafted menu to our cozy, chill, and relaxing atmosphere. Whether
                        you're here for a quick coffee, a family meal, or a hangout with
                        friends, we make sure every visit feels like home.
                    </p>

                    {/* Value Tags */}
                    <div className="about-values">
                        {values.map((v) => (
                            <span key={v.label} className="about-value-tag">
                                <Icon name={v.icon} size={14} />
                                {v.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
