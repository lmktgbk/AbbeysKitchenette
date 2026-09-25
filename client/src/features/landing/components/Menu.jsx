import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";

/**
 * Menu
 * Menu showcase section with category filter tabs and food/drink cards.
 * Uses real photos from public/landing/.
 * Cards re-animate via key changes when the active filter changes.
 * Includes "Order Online" CTA at the bottom.
 */

const menuItems = [
    {
        name: "Abbey's Signature Grilled Liempo",
        description: "Juicy, smoky, savory pork belly grilled to perfection. Served with steamed rice & special sawsawan.",
        image: "/landing/grilled_liempo.jpg",
        category: "food",
        tag: "Best Seller",
    },
    {
        name: "Abbey's Signature Tapsilog",
        description: "Filipino classic: savory marinated beef tapa, garlic fried rice, sunny-side up eggs & cucumbers.",
        image: "/landing/tapsilog_poster.jpg",
        category: "food",
        tag: "Filipino Classic",
    },
    {
        name: "Korean-Inspired Bibimbowl",
        description: "Bold flavors with savory ground beef, stir-fried veggies, spicy kimchi & steamed rice.",
        image: "/landing/bibimbowl.jpg",
        category: "food",
        tag: "Popular",
    },
    {
        name: "Creamy Carbonara",
        description: "Rich, velvety pasta sauce topped with savory bacon bits, parmesan & garlic toast.",
        image: "/landing/creamy_carbonara.jpg",
        category: "food",
        tag: "Comfort Food",
    },
    {
        name: "Classic Meatball Spaghetti",
        description: "Juicy beef meatballs in slow-cooked rich tomato sauce over spaghetti with parmesan.",
        image: "/landing/meatball_spaghetti.jpg",
        category: "food",
        tag: "House Classic",
    },
    {
        name: "Classic Favorites (Burgers & Clubhouse)",
        description: "Juicy cheeseburger & multi-layer clubhouse sandwich paired with golden crispy fries.",
        image: "/landing/cheeseburger_clubhouse.jpg",
        category: "food",
        tag: "Perfect Pairing",
    },
    {
        name: "Classic Grilled Cheese & Fries",
        description: "Golden toasted sandwich filled with gooey melty cheese, served with crispy fries.",
        image: "/landing/grilled_cheese_poster.jpg",
        category: "food",
        tag: "Kids & Adults",
    },
    {
        name: "Streetfood Platter",
        description: "Crispy fries, fish balls, chicken isaw with savory gravy dip & spicy vinegar.",
        image: "/landing/streetfood_platter.jpg",
        category: "food",
        tag: "Perfect to Share",
    },
    {
        name: "Honey Milk Foam Iced Coffee",
        description: "Silky & smooth iced coffee sweetened with natural honey and topped with velvety milk foam.",
        image: "/landing/honey_milk_foam.jpg",
        category: "drinks",
        tag: "Must Try",
    },
    {
        name: "Strawberry Matcha",
        description: "Sweet meets earthy — delicious layered blend of fresh strawberry puree & matcha.",
        image: "/landing/strawberry_matcha.jpg",
        category: "drinks",
        tag: "Fan Favorite",
    },
    {
        name: "Chocolate Salted Cream Cheese Frappe",
        description: "Deep smooth chocolate blended cold with rich salted cream cheese. Sweet meets salty!",
        image: "/landing/choco_salted_frappe.jpg",
        category: "drinks",
        tag: "Indulgent",
    },
    {
        name: "Red Velvet Frappe",
        description: "Rich, creamy red velvet frappe crafted with real cake crumbs & whipped cream.",
        image: "/landing/red_velvet_frappe.jpg",
        category: "drinks",
        tag: "Sweet Treat",
    },
    {
        name: "Matcha Frappe",
        description: "Creamy, refreshing, absolutely matcha-licious frappe made with premium matcha powder.",
        image: "/landing/matcha_frappe.jpg",
        category: "drinks",
        tag: "Premium",
    },
    {
        name: "Soda Pop Series",
        description: "Fizzy, fruity, feel-good sparkling drinks in Mango Fizz, Blackberry Bliss, Strawberry Spark & Melon Breeze.",
        image: "/landing/soda_pop_series.jpg",
        category: "drinks",
        tag: "New Series",
    },
];

const categories = [
    { key: "all",    label: "All Items" },
    { key: "food",   label: "Hearty Meals & Snacks" },
    { key: "drinks", label: "Specialty Drinks & Frappes" },
];

export default function Menu() {
    const [active, setActive] = useState("all");
    const [selectedItem, setSelectedItem] = useState(null);
    const [showFullMenu, setShowFullMenu] = useState(false);
    // Epoch key — bump on filter change to re-mount cards and replay animations
    const [filterEpoch, setFilterEpoch] = useState(0);
    const prevActive = useRef(active);

    const handleFilter = (key) => {
        if (key === active) return;
        setActive(key);
        setFilterEpoch((e) => e + 1);
        prevActive.current = key;
    };

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
                        onClick={() => handleFilter(cat.key)}
                        aria-pressed={active === cat.key}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Menu Grid — filterEpoch key re-triggers lp-reveal animations */}
            <div className="menu-grid" key={filterEpoch}>
                {filtered.map((item, i) => (
                    <div
                        key={`${filterEpoch}-${item.name}`}
                        className={`menu-card lp-reveal lp-reveal-delay-${Math.min(i % 4 + 1, 4)} lp-visible`}
                        onClick={() => setSelectedItem(item)}
                        style={{ cursor: "pointer" }}
                    >
                        <div className="menu-card-img-wrap">
                            <img
                                src={item.image}
                                alt={item.name}
                                className="menu-card-img"
                                loading="lazy"
                            />
                            <div className="menu-card-overlay-hint">
                                <Icon name="search" size={18} />
                                <span>Click to view poster</span>
                            </div>
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

            {/* Product Item Full Modal */}
            {selectedItem && (
                <div className="menu-modal-overlay" onClick={() => setSelectedItem(null)}>
                    <div className="menu-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="menu-modal-close"
                            onClick={() => setSelectedItem(null)}
                            aria-label="Close product view"
                        >
                            <Icon name="x" size={22} />
                        </button>
                        
                        <div className="menu-modal-grid">
                            <div className="menu-modal-img-container">
                                <img
                                    src={selectedItem.image}
                                    alt={selectedItem.name}
                                    className="menu-modal-full-img"
                                />
                            </div>
                            <div className="menu-modal-details">
                                {selectedItem.tag && (
                                    <span className="menu-modal-badge">{selectedItem.tag}</span>
                                )}
                                <h3 className="menu-modal-title">{selectedItem.name}</h3>
                                <p className="menu-modal-desc">{selectedItem.description}</p>

                                <div className="menu-modal-actions">
                                    <Link to="/order" className="menu-modal-cta">
                                        <Icon name="shoppingBag" size={18} />
                                        Order Online Now
                                    </Link>
                                    <button
                                        type="button"
                                        className="menu-modal-close-btn"
                                        onClick={() => setSelectedItem(null)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Overall Full Menu Display ── */}
            <div className="overall-menu-section lp-reveal lp-reveal-delay-2" style={{ marginTop: "4rem" }}>
                <div className="text-center lp-reveal">
                    <h3 className="landing-title" style={{ fontSize: "2rem" }}>Our Full Menu</h3>
                    <p className="landing-subtitle" style={{ marginTop: "0.5rem" }}>
                        Explore everything we offer, from specialty coffee to hearty meals.
                    </p>
                </div>
                
                <div className="overall-menu-grid" style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
                    gap: "2rem",
                    marginTop: "2.5rem"
                }}>
                    <div className="overall-menu-card lp-reveal lp-reveal-delay-3" style={{ borderRadius: "16px", overflow: "hidden", boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)" }}>
                        <img 
                            src="/landing/menu_overall_1.jpg" 
                            alt="Drinks Menu" 
                            style={{ width: "100%", height: "auto", display: "block" }} 
                            loading="lazy" 
                        />
                    </div>
                    <div className="overall-menu-card lp-reveal lp-reveal-delay-4" style={{ borderRadius: "16px", overflow: "hidden", boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)" }}>
                        <img 
                            src="/landing/menu_overall_2.jpg" 
                            alt="Food Menu" 
                            style={{ width: "100%", height: "auto", display: "block" }} 
                            loading="lazy" 
                        />
                    </div>
                </div>
            </div>

            {/* Order Online CTA */}
            <div className="menu-cta-wrap lp-reveal lp-reveal-delay-2" style={{ marginTop: "4rem" }}>
                <Link to="/order" className="menu-cta-btn">
                    <Icon name="shoppingBag" size={18} />
                    Order Online Now
                </Link>
            </div>
        </section>
    );
}
