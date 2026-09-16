import { useEffect } from "react";
import "../landing.css";
import { useStoreSettings } from "../query";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import About from "../components/About";
import Menu from "../components/Menu";
import Location from "../components/Location";
import Testimonials from "../components/Testimonials";
import Contact from "../components/Contact";
import Footer from "../components/Footer";

/**
 * LandingPage
 * Public-facing landing page for Abbey's Kitchenette restaurant.
 * Fetches store settings and passes them as props to child components.
 */
export default function LandingPage() {
    const { data: settingsData } = useStoreSettings();
    const settings = settingsData?.data || {};

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("lp-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 }
        );

        const els = document.querySelectorAll(".lp-reveal");
        els.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    return (
        <div className="lp-root">
            <Navbar storeName={settings.storeName} />
            <Hero storeName={settings.storeName} />

            {/* Info bar */}
            <div className="info-bar" aria-label="Restaurant highlights">
                <div className="info-bar-track">
                    {[
                        "Freshly Cooked Daily",
                        "Artisan Coffee",
                        "House-Made Pastries",
                        "Cozy Atmosphere",
                        "Filipino Favorites",
                        "Refreshing Drinks",
                        "Built with Love",
                        "Lipa City, Batangas",
                        "Freshly Cooked Daily",
                        "Artisan Coffee",
                        "House-Made Pastries",
                        "Cozy Atmosphere",
                        "Filipino Favorites",
                        "Refreshing Drinks",
                        "Built with Love",
                        "Lipa City, Batangas",
                    ].map((item, i) => (
                        <span key={i} className="info-bar-item">
                            {item}
                        </span>
                    ))}
                </div>
            </div>

            <div className="about-section">
                <About />
            </div>
            <div className="menu-section">
                <Menu />
            </div>
            <div className="testimonials-section">
                <Testimonials />
            </div>
            <div className="location-section">
                <Location settings={settings} />
            </div>
            <div className="contact-section">
                <Contact settings={settings} />
            </div>
            <Footer settings={settings} />
        </div>
    );
}
