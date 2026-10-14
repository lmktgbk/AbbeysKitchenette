import Icon from "@/components/ui/icon";
import { formatStoreHours } from "../formatHours";
import Contact from "./Contact";

export default function Location({ settings = {} }) {
    // One section groups visit details and contact actions beside the venue photo.
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
        <section id="location" className="landing-section visit-contact-section">
            <div className="location-grid">
                <div className="location-info lp-reveal lp-reveal-delay-1">
                    <div className="visit-heading">
                        <h2 className="landing-title">Visit &amp; Contact Us</h2>
                        <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                            We'd love to see you! Come dine in and experience the Abbey's
                            Kitchenette difference.
                        </p>
                        <span className="landing-title-line" />
                    </div>
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
                    <Contact settings={settings} />
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
