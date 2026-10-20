import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import LegalContact from "../components/LegalContact";
import "../landing.css";

/**
 * PrivacyPolicy
 * Guest and staff privacy notice describing current system processing.
 * Displays how Abbey's Kitchenette collects, uses, and protects personal data.
 */
export default function PrivacyPolicy() {
    const currentYear = new Date().getFullYear();

    const sections = [
        {
            title: "1. Who This Notice Covers",
            content: <>
                <p>Abbey's Kitchenette is responsible for personal information collected through this website, guest ordering, and its internal restaurant system. This notice covers guests and customers. Section 5 explains additional processing for staff and administrators.</p>
                <p>For privacy questions or requests, contact the store using Section 8. Store management handles these requests.</p>
            </>,
        },
        {
            title: "2. Information Collected From Guests",
            content: <>
                <ul>
                    <li><strong>Orders:</strong> Your name, table number, selected items, quantities, prices, order status, and transaction times. Staff may also enter this information when taking your order.</li>
                    <li><strong>Payments and adjustments:</strong> Payment method, amounts, payment references where applicable, and cancellation or refund records. Discount records may include a senior citizen or PWD ID number when provided to staff for a discount.</li>
                    <li><strong>Technical information:</strong> IP addresses and request or security records used to operate and protect the service.</li>
                </ul>
                <p>Guest checkout does not require an account, email address, or phone number. It does require a name and table number so staff can identify and serve the order.</p>
            </>,
        },
        {
            title: "3. Why We Use Information",
            content: <>
                <p>We use order information to accept, prepare, track, and serve orders; record payments; handle corrections, cancellations, and refunds; and respond to requests. Processing needed to fulfill an order supports our transaction with you. We also retain relevant records to meet applicable legal obligations.</p>
                <p>Order and inventory records support sales reporting, demand forecasting, and stock planning. Security records help prevent misuse and investigate incidents. These operational and security uses are subject to applicable privacy requirements and safeguards.</p>
                <p>Staff sign-in uses authentication cookies. Guest ordering uses browser storage for cart and submission-retry information. Order-tracking links contain an access token: keep your link private, especially on shared devices.</p>
            </>,
        },
        {
            title: "4. Service Providers and Access",
            content: <>
                <p>Authorized personnel access information as needed for their work. The following providers support the system:</p>
                <ul>
                    <li><strong>Vercel, Railway, and Supabase:</strong> Website hosting, application processing, and database storage. Hosting infrastructure may process connection and request information.</li>
                    <li><strong>Brevo:</strong> Delivery of staff verification, recovery, and account-related emails.</li>
                    <li><strong>Cloudinary:</strong> Storage and delivery of uploaded images, including staff profile images.</li>
                    <li><strong>Google Sheets:</strong> When configured, exported sales records, including customer names, tables, purchased items, amounts, and staff attribution.</li>
                    <li><strong>Google Gemini:</strong> Operational information submitted for AI-assisted recommendations, such as inventory, demand, and anomaly context.</li>
                </ul>
                <p>Providers may process information outside the Philippines. We remain responsible for applying appropriate safeguards to the processing we arrange. Information may also be disclosed where required by law. We do not sell personal information for marketing.</p>
            </>,
        },
        {
            title: "5. Additional Notice for Staff and Administrators",
            content: <>
                <p>Administrators create staff accounts using names, email addresses, and roles. The system also processes optional profile images, password hashes, verification and recovery records, sessions, and account status.</p>
                <p>Login attempts, IP information, access denials, account lockouts, and exhausted OTP attempts may be recorded for security. Existing controls may restrict staff login to the store network or temporarily limit authentication attempts.</p>
                <p>Orders and operational actions can be attributed to staff accounts. Shift opening and closing times, cash balances, discrepancies, notes, and audit records support reconciliation, accountability, and incident review.</p>
                <p>Automated checks can flag unusual activity and apply authentication limits. Business analytics and AI-assisted advice support management review; an alert is not proof of misconduct. Staff may contact management about inaccurate records or to request review of an alert.</p>
            </>,
        },
        {
            title: "6. Retention and Protection",
            content: <>
                <p>Information is retained for as long as needed for order handling, accounting, security, dispute resolution, and applicable legal obligations. Relevant accounting records may need to remain after a customer request or a staff account is deactivated. A tax-record obligation does not automatically require keeping every personal detail for the same period.</p>
                <p>This notice does not promise immediate or automatic deletion. Retention and deletion requests are assessed against the purpose of the records and applicable requirements.</p>
                <p>The system uses password hashing, HttpOnly authentication cookies, role-based permissions, and configured staff-network restrictions. No online service can guarantee absolute security. Do not share staff credentials or guest order-tracking links.</p>
            </>,
        },
        {
            title: "7. Your Privacy Rights",
            content: <>
                <p>Under the Philippine Data Privacy Act of 2012, you may exercise applicable rights to information, access, correction, objection, erasure or blocking, data portability, and damages where provided by law. Rights are subject to applicable conditions and lawful record-retention requirements.</p>
                <p>Contact us with your request and enough information to locate the relevant records. We may need to verify your identity before disclosing or changing personal information. Do not send passwords or OTP codes.</p>
                <p>You may raise a complaint with the <a href="https://privacy.gov.ph" className="privacy-inline-link" target="_blank" rel="noopener noreferrer">National Privacy Commission</a>.</p>
            </>,
        },
        {
            title: "8. Contact and Updates",
            content: <>
                <p>For privacy questions, requests, or concerns, contact store management:</p>
                <LegalContact />
                <p>Changes will be published on this page with a revised date. Please review the notice when using the service.</p>
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
                        <h1 className="privacy-title">Privacy Policy</h1>
                        <p className="privacy-subtitle">
                            Your privacy matters to us. Learn how we collect, use, and protect
                            guest and staff information, and how to exercise your privacy rights.
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
