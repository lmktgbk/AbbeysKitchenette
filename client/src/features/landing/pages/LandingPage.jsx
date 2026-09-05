import { useEffect } from "react";
import "../landing.css";
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
 * Composes all sections: Navbar, Hero, About, Menu, Location,
 * Testimonials, Contact, Footer.
 *
 * Mounts an Intersection Observer that adds `.lp-visible` to any
 * `.lp-reveal` element when it enters the viewport (scroll-reveal).
 */
export default function LandingPage() {
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("lp-visible");
                        // Once revealed, stop observing (one-shot)
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
            <Navbar />
            <Hero />

            {/* Info bar — clean, typography-only, no emojis */}
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
                        /* duplicate for seamless loop */
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
                <Location />
            </div>
            <div className="contact-section">
                <Contact />
            </div>
            <Footer />
        </div>
    );
}
