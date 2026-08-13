import Icon from "@/components/ui/icon";

/**
 * About
 * About section telling the story of Abbey's Kitchenette.
 * Two-column layout: image + text.
 */
export default function About() {
    const values = [
        { icon: "heart", label: "Built with Love" },
        { icon: "coffee", label: "Cozy Atmosphere" },
        { icon: "utensils", label: "Quality Food" },
        { icon: "users", label: "Friendly Service" },
    ];

    return (
        <section id="about" className="landing-section bg-background">
            <div className="about-grid">
                {/* Image */}
                <img
                    src="/landing/diners.jpg"
                    alt="Diners enjoying food at Abbey's Kitchenette"
                    className="about-image"
                />

                {/* Text */}
                <div className="about-text">
                    <h3>Our Story</h3>
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

                    {/* Values */}
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
