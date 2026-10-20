import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import LegalContact from "../components/LegalContact";
import "../landing.css";

/**
 * TermsOfService
 * Terms of service page for Abbey's Kitchenette's point-of-sale system
 * and online ordering platform.
 */
export default function TermsOfService() {
    const currentYear = new Date().getFullYear();

    const sections = [
        {
            title: "1. About This Service",
            content: <>
                <p>These terms cover the Abbey's Kitchenette website and guest ordering service. You can browse the menu, submit an order for your table, and track its status without creating an account.</p>
                <p>Internal staff access is restricted to authorized accounts and is subject to the store's operating instructions and account-use rules.</p>
            </>,
        },
        {
            title: "2. Placing an Order",
            content: <>
                <p>Provide an accurate name and table number, and review the items, variants, quantities, and displayed prices before submitting. If you are unsure about ingredients or have an allergy or dietary requirement, speak to staff before ordering.</p>
                <p>Submitting an order sends a request to the store. Orders remain subject to staff acceptance, item availability, and payment confirmation. A pending order is not confirmation that preparation has started.</p>
                <p>If an item becomes unavailable or a displayed price appears incorrect, staff will explain the available options before proceeding. This website does not promise a delivery service or a specific preparation time.</p>
            </>,
        },
        {
            title: "3. Prices and Payments",
            content: <>
                <p>Prices are shown in Philippine pesos. Staff will confirm the payable amount and any applicable discount. Eligibility for senior citizen, PWD, or promotional discounts is subject to applicable requirements and staff verification.</p>
                <p>Pay using a method accepted by the store and follow staff instructions. Guest submission alone does not charge a bank account or e-wallet. Staff confirm and record payments; an entered payment reference alone does not prove that funds were received.</p>
            </>,
        },
        {
            title: "4. Changes, Cancellations, and Refunds",
            content: <>
                <p>Contact staff promptly to correct or cancel an order. Available options depend on whether the order has been accepted, paid for, or prepared. Customers cannot assume an order is cancelled until staff confirm it.</p>
                <p>If the store cannot fulfill an order, or an item is incorrect or has a quality issue, notify staff so they can assess an appropriate correction, replacement, cancellation, or refund. Where a refund is approved or legally required, staff will explain the amount and how it will be returned.</p>
                <p>Nothing in these terms removes your rights or remedies under applicable Philippine consumer law.</p>
            </>,
        },
        {
            title: "5. Responsible Use and Tracking",
            content: <>
                <p>Do not submit false or duplicate orders, attempt unauthorized access, interfere with the service, or access another person's order without permission. If submission appears to fail, check your order status or ask staff before placing it again.</p>
                <p>Your order-tracking link permits access to information about that order. Keep it private and avoid leaving it open on a shared device. Staff must keep their passwords and verification codes private and use only their assigned accounts.</p>
            </>,
        },
        {
            title: "6. Availability and Website Content",
            content: <>
                <p>The website may be interrupted by maintenance, connectivity problems, or service-provider outages. If ordering or tracking is unavailable, contact store staff directly. Status displays and timing estimates are informational and are not guaranteed serving times.</p>
                <p>The restaurant's branding and original content belong to their respective owners. Do not copy or misuse them without permission or another lawful basis.</p>
            </>,
        },
        {
            title: "7. Privacy and Applicable Law",
            content: <>
                <p>Our <Link to="/privacy-policy" className="privacy-inline-link">Privacy Policy</Link> explains guest information, staff records, service providers, and privacy requests.</p>
                <p>These terms are subject to Philippine law. They do not exclude mandatory consumer protections or prevent you from contacting an appropriate regulator or seeking remedies available under law.</p>
            </>,
        },
        {
            title: "8. Contact and Changes",
            content: <>
                <p>For order concerns or questions about these terms, contact the store:</p>
                <LegalContact />
                <p>We may update these terms and publish a revised date on this page. Changes do not automatically rewrite an order already agreed with you.</p>
            </>,
        },
    ];

    return (
        <div className="lp-root">
            {/* Header */}
            <header className="privacy-header">
                <div className="privacy-header-inner">
                    <Link to="/" className="privacy-logo">
                        <img
                            src="/favicon.png"
                            alt="Abbey's Kitchenette"
                            style={{ width: 36, height: 36, borderRadius: "999px", objectFit: "cover" }}
                        />
                        <span>Abbey's Kitchenette</span>
                    </Link>
                    <Link to="/" className="privacy-back-link">
                        <Icon name="arrow-left" size={16} />
                        Back to Home
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="privacy-main">
                <div className="privacy-container">
                    {/* Hero */}
                    <div className="privacy-hero">
                        <h1 className="privacy-title">Terms of Service</h1>
                        <p className="privacy-subtitle">
                            Please read these terms carefully before using our services.
                            These terms explain guest ordering, payment, and how to get help.
                        </p>
                        <p className="privacy-effective-date">
                            Last updated: October 20, 2026
                        </p>
                    </div>

                    {/* Sections */}
                    <div className="privacy-sections">
                        {sections.map((section, idx) => (
                            <section key={idx} className="privacy-section">
                                <h2 className="privacy-section-title">{section.title}</h2>
                                <div className="privacy-section-content">{section.content}</div>
                            </section>
                        ))}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="privacy-footer">
                <p>&copy; {currentYear} Abbey's Kitchenette. All rights reserved.</p>
                <div className="privacy-footer-links">
                    <Link to="/privacy-policy" className="privacy-footer-link">Privacy Policy</Link>
                    <Link to="/terms-of-service" className="privacy-footer-link">Terms of Service</Link>
                    <Link to="/" className="privacy-footer-link">Home</Link>
                </div>
            </footer>
        </div>
    );
}
