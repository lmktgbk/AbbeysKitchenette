import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
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
            title: "1. Acceptance of Terms",
            content: (
                <p>
                    By accessing or using the Abbey's Kitchenette point-of-sale system, online
                    ordering platform, or related services ("Services"), you agree to be bound
                    by these Terms of Service. If you do not agree to these terms, please do
                    not use our Services.
                </p>
            ),
        },
        {
            title: "2. Description of Services",
            content: (
                <>
                    <p>Abbey's Kitchenette provides:</p>
                    <ul>
                        <li><strong>Online Ordering:</strong> A platform for customers to browse our menu and place food and beverage orders</li>
                        <li><strong>Point-of-Sale System:</strong> An internal system for staff to process orders, manage inventory, and track sales</li>
                        <li><strong>Kitchen Display:</strong> An interface for kitchen staff to manage and fulfill orders</li>
                    </ul>
                </>
            ),
        },
        {
            title: "3. User Accounts",
            content: (
                <>
                    <p><strong>Staff Accounts:</strong></p>
                    <ul>
                        <li>Staff accounts are created by administrators for authorized personnel only</li>
                        <li>Staff are responsible for maintaining the confidentiality of their PIN and login credentials</li>
                        <li>Staff must not share their accounts or credentials with others</li>
                        <li>Staff must report any unauthorized use of their accounts immediately</li>
                    </ul>
                    <p><strong>Customer Accounts:</strong></p>
                    <ul>
                        <li>Online ordering does not require account creation</li>
                        <li>Customers provide information (name, contact) voluntarily for order fulfillment</li>
                    </ul>
                </>
            ),
        },
        {
            title: "4. Acceptable Use",
            content: (
                <>
                    <p>You agree to use our Services only for their intended purposes. You must not:</p>
                    <ul>
                        <li>Attempt to gain unauthorized access to any part of the system</li>
                        <li>Use the system to process fraudulent or unauthorized transactions</li>
                        <li>Interfere with or disrupt the system or servers</li>
                        <li>Use automated tools to access or interact with the system without authorization</li>
                        <li>Violate any applicable laws or regulations</li>
                    </ul>
                </>
            ),
        },
        {
            title: "5. Orders and Payments",
            content: (
                <>
                    <ul>
                        <li>All orders are subject to availability and confirmation</li>
                        <li>Prices displayed are inclusive of applicable taxes unless stated otherwise</li>
                        <li>Payment is processed at the time of order pickup or delivery as applicable</li>
                        <li>Abbey's Kitchenette reserves the right to refuse or cancel orders at its discretion</li>
                    </ul>
                </>
            ),
        },
        {
            title: "6. Intellectual Property",
            content: (
                <>
                    <p>
                        All content, design, graphics, and other materials in our Services are
                        the intellectual property of Abbey's Kitchenette. You may not reproduce,
                        distribute, or create derivative works without our express written permission.
                    </p>
                    <p>
                        The Abbey's Kitchenette name, logo, and related marks are trademarks of
                        Abbey's Kitchenette. Unauthorized use of these marks is prohibited.
                    </p>
                </>
            ),
        },
        {
            title: "7. Limitation of Liability",
            content: (
                <>
                    <p>To the maximum extent permitted by law:</p>
                    <ul>
                        <li>Abbey's Kitchenette shall not be liable for any indirect, incidental, special, or consequential damages</li>
                        <li>Our total liability shall not exceed the amount paid for the specific order giving rise to the claim</li>
                        <li>We are not liable for delays or failures caused by circumstances beyond our reasonable control</li>
                    </ul>
                </>
            ),
        },
        {
            title: "8. Indemnification",
            content: (
                <p>
                    You agree to indemnify and hold harmless Abbey's Kitchenette, its owners,
                    employees, and affiliates from any claims, losses, or damages arising from
                    your use of the Services or violation of these Terms.
                </p>
            ),
        },
        {
            title: "9. Privacy",
            content: (
                <p>
                    Your use of our Services is also governed by our Privacy Policy, which
                    describes how we collect, use, and protect your personal data in compliance
                    with the Philippine Data Privacy Act of 2012 (RA 10173). Please review our{" "}
                    <Link to="/privacy-policy" className="privacy-inline-link">Privacy Policy</Link>{" "}
                    for more information.
                </p>
            ),
        },
        {
            title: "10. Modifications",
            content: (
                <p>
                    Abbey's Kitchenette reserves the right to modify these Terms at any time.
                    Changes will be effective immediately upon posting. Your continued use of
                    the Services after changes constitutes acceptance of the modified Terms.
                </p>
            ),
        },
        {
            title: "11. Governing Law",
            content: (
                <p>
                    These Terms shall be governed by and construed in accordance with the laws
                    of the Republic of the Philippines. Any disputes shall be resolved in the
                    appropriate courts of Lipa City, Batangas, Philippines.
                </p>
            ),
        },
        {
            title: "12. Severability",
            content: (
                <p>
                    If any provision of these Terms is found to be unenforceable, the remaining
                    provisions shall continue in full force and effect.
                </p>
            ),
        },
        {
            title: "13. Contact",
            content: (
                <>
                    <p>For questions about these Terms of Service, please contact:</p>
                    <div className="privacy-contact-card">
                        <p><strong>Abbey's Kitchenette</strong></p>
                        <p>Robledo Compound, Bulacnin, Lipa City</p>
                        <p>Phone: 0929 781 1212</p>
                        <p>Email: maryrosemendoza78@yahoo.com</p>
                    </div>
                </>
            ),
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
                            By using Abbey's Kitchenette's services, you agree to these terms.
                        </p>
                        <p className="privacy-effective-date">
                            Effective Date: {new Date().toLocaleDateString("en-PH", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
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
