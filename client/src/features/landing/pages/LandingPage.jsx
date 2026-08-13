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
 */
export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <Hero />
            <About />
            <Menu />
            <Location />
            <Testimonials />
            <Contact />
            <Footer />
        </div>
    );
}
