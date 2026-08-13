import Icon from "@/components/ui/icon";

/**
 * Location
 * Location and contact info section.
 * Two-column layout: info + image.
 */
export default function Location() {
    const details = [
        {
            icon: "mapPin",
            label: "Address",
            value: "Robledo Compound, Bulacnin, Lipa City",
        },
        {
            icon: "clock",
            label: "Hours",
            value: "Mon – Sun: 10:00 AM – 10:00 PM",
        },
        {
            icon: "phone",
            label: "Phone",
            value: "0929 781 1212",
        },
        {
            icon: "mail",
            label: "Email",
            value: "maryrosemendoza78@yahoo.com",
        },
    ];

    return (
        <section id="location" className="landing-section bg-background">
            <div className="text-center">
                <h2 className="landing-title">Visit Us</h2>
                <p className="landing-subtitle">
                    We'd love to see you! Come dine in and experience
                    the Abbey's Kitchenette difference.
                </p>
            </div>

            <div className="location-grid mt-10">
                {/* Info */}
                <div className="location-info">
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
                <img
                    src="/landing/outdoor_tent.jpg"
                    alt="Abbey's Kitchenette outdoor seating area"
                    className="location-image"
                    loading="lazy"
                />
            </div>
        </section>
    );
}
