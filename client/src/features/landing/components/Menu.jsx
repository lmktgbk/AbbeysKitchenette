import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";

/**
 * Menu
 * Menu showcase section with category filter tabs and food/drink cards.
 * Uses real photos from public/landing/.
 * Includes "Order Online" CTA at the bottom.
 */

const menuItems = [
    {
        name: "Tapsilog",
        description: "Classic Filipino breakfast — cured beef, garlic rice, and egg.",
        image: "/landing/tapsilog_dish.jpg",
        category: "food",
        tag: "Best Seller",
    },
    {
        name: "Pasta Dish",
        description: "Creamy, rich pasta with our signature sauce and toppings.",
        image: "/landing/pasta_dish.jpg",
        category: "food",
        tag: "Popular",
    },
    {
        name: "Sandwich & Fries",
        description: "Hearty sandwich with crispy golden fries on the side.",
        image: "/landing/sandwich_fries.jpg",
        category: "food",
        tag: null,
    },
    {
        name: "Lotus Croffle",
        description: "Crispy croffle topped with lotus biscoff and cream.",
        image: "/landing/lotus_croffle.jpg",
        category: "pastries",
        tag: "Must Try",
    },
    {
        name: "Pastries Selection",
        description: "Freshly baked pastries — perfect with your favorite coffee.",
        image: "/landing/pastries_display.jpg",
        category: "pastries",
        tag: null,
    },
    {
        name: "Matcha Strawberry",
        description: "Refreshing matcha blend with sweet strawberry notes.",
        image: "/landing/matcha_strawberry.jpg",
        category: "drinks",
        tag: "Fan Favorite",
    },
    {
        name: "Iced Coffee",
        description: "Bold espresso over ice — smooth, strong, and refreshing.",
        image: "/landing/iced_drink.png",
        category: "drinks",
        tag: null,
    },
    {
        name: "Neon Bloom",
        description: "A vibrant, eye-catching drink as beautiful as it tastes.",
        image: "/landing/neon_bloom.jpg",
        category: "drinks",
        tag: "Instagrammable",
    },
];

const categories = [
    { key: "all",      label: "All Items" },
    { key: "food",     label: "Food" },
    { key: "drinks",   label: "Drinks" },
    { key: "pastries", label: "Pastries" },
];

export default function Menu() {
    const [active, setActive] = useState("all");

    const filtered =
        active === "all"
            ? menuItems
            : menuItems.filter((item) => item.category === active);

    return (
        <section id="menu" className="landing-section">
            {/* Title */}
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Our Menu</h2>
                <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                    From hearty meals to refreshing drinks and sweet pastries —
                    there's something for everyone.
                </p>
                <span className="landing-title-line" />
            </div>

            {/* Category Tabs */}
            <div className="menu-tabs lp-reveal lp-reveal-delay-1">
                {categories.map((cat) => (
                    <button
                        key={cat.key}
                        className={`menu-tab ${active === cat.key ? "menu-tab-active" : ""}`}
                        onClick={() => setActive(cat.key)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Menu Grid */}
            <div className="menu-grid">
                {filtered.map((item, i) => (
                    <div
                        key={item.name}
                        className={`menu-card lp-reveal lp-reveal-delay-${Math.min(i % 4 + 1, 4)}`}
                    >
                        <div className="menu-card-img-wrap">
                            <img
                                src={item.image}
                                alt={item.name}
                                className="menu-card-img"
                                loading="lazy"
                            />
                        </div>
                        <div className="menu-card-body">
                            <div className="menu-card-name">{item.name}</div>
                            <div className="menu-card-desc">{item.description}</div>
                            {item.tag && (
                                <span className="menu-card-tag">{item.tag}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Order Online CTA */}
            <div className="menu-cta-wrap lp-reveal lp-reveal-delay-2">
                <Link to="/order" className="menu-cta-btn">
                    <Icon name="shoppingBag" size={18} />
                    Order Online Now
                </Link>
            </div>
        </section>
    );
}
