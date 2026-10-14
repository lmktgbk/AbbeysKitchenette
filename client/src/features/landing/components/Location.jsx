import Icon from "@/components/ui/icon";
import { formatStoreHours } from "../formatHours";

export default function Location({ settings = {} }) {
    // Visit Us answers only where + when open. Phone/email live in
    // Get in Touch (action cards) and the footer — not repeated here.
    const details = [
        {
            icon: "mapPin",
            label: "Address",
            value: settings.storeAddress || "Robledo Compound, Bulacnin, Lipa City",
        },
        {
            icon: "clock",
            label: "Hours",
            value: formatStoreHours(settings.storeHours),
        },
    ];

    return (
        <section id="location" className="landing-section">
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Visit Us</h2>
                <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                    We'd love to see you! Come dine in and experience the Abbey's
                    Kitchenette difference.
                </p>
                <span className="landing-title-line" />
            </div>

            <div className="location-grid" style={{ marginTop: "3.5rem" }}>
                {/* Info */}
                <div className="location-info lp-reveal lp-reveal-delay-1">
                    {details.map((item) => (
                        <div key={item.label} className="location-item">
                            <div className="location-icon">
                                <Icon name={item.icon} size={18} />
                            </div>
                            <div>
                                <div className="location-item-label">{item.label}</div>
                                <div className="location-item-value">{item.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Image */}
                <div className="lp-reveal lp-reveal-delay-2">
                    <img
                        src="/landing/outdoor_gazebo.jpg"
                        alt="Abbey's Kitchenette illuminated outdoor night gazebo area"
                        className="location-image"
                        loading="lazy"
                    />
                </div>
            </div>
        </section>
    );
}
