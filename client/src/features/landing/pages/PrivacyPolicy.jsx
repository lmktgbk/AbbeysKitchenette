import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import "../landing.css";

/**
 * PrivacyPolicy
 * Privacy policy page compliant with the Philippine Data Privacy Act of 2012 (RA 10173).
 * Displays how Abbey's Kitchenette collects, uses, and protects personal data.
 */
export default function PrivacyPolicy() {
    const currentYear = new Date().getFullYear();

    const sections = [
        {
            title: "1. Personal Information Controller",
            content: (
                <>
                    <p>
                        Abbey's Kitchenette ("we", "us", or "our") is the Personal Information
                        Controller responsible for the collection, processing, and storage of
                        personal data through our point-of-sale system and online ordering platform.
                    </p>
                    <p>
                        <strong>Data Protection Officer (DPO):</strong> [Name to be designated]
                    </p>
                    <p>
                        For inquiries regarding this Privacy Policy or our data practices, please
                        contact us using the information provided in Section 10.
                    </p>
                </>
            ),
        },
        {
            title: "2. Personal Data We Collect",
            content: (
                <>
                    <p>We collect the following categories of personal data:</p>
                    <div className="privacy-data-table">
                        <div className="privacy-data-row">
                            <div className="privacy-data-category">Staff Information</div>
                            <div className="privacy-data-items">Full name, email address, role, profile image</div>
                        </div>
                        <div className="privacy-data-row">
                            <div className="privacy-data-category">Authentication Data</div>
                            <div className="privacy-data-items">Password (hashed), PIN (hashed), OTP codes</div>
                        </div>
                        <div className="privacy-data-row">
                            <div className="privacy-data-category">Customer Information</div>
                            <div className="privacy-data-items">Name, table number (walk-in orders)</div>
                        </div>
                        <div className="privacy-data-row">
                            <div className="privacy-data-category">Order Data</div>
                            <div className="privacy-data-items">Items ordered, quantities, prices, timestamps</div>
                        </div>
                        <div className="privacy-data-row">
                            <div className="privacy-data-category">System Data</div>
                            <div className="privacy-data-items">IP addresses, login timestamps, audit logs</div>
                        </div>
                    </div>
                </>
            ),
        },
        {
            title: "3. How We Collect Your Data",
            content: (
                <>
                    <p><strong>Staff Data:</strong> Collected during account creation by administrators. Profile images are uploaded by staff members.</p>
                    <p><strong>Customer Data:</strong> Collected when you place an order through our online ordering system or when staff enters your order at the POS terminal.</p>
                    <p><strong>System Data:</strong> Automatically collected during system usage for security and audit purposes.</p>
                </>
            ),
        },
        {
            title: "4. Purpose of Collection",
            content: (
                <>
                    <p>We process your personal data for the following purposes:</p>
                    <ul>
                        <li><strong>Order Processing:</strong> To prepare, track, and fulfill your food and beverage orders</li>
                        <li><strong>Staff Management:</strong> To manage employee accounts, roles, and system access</li>
                        <li><strong>Performance Tracking:</strong> To monitor staff productivity and service quality</li>
                        <li><strong>Security:</strong> To protect against unauthorized access and maintain audit trails</li>
                        <li><strong>Business Operations:</strong> To manage inventory, sales reporting, and business analytics</li>
                    </ul>
                </>
            ),
        },
        {
            title: "5. How We Use Your Data",
            content: (
                <>
                    <p>Your personal data is used solely for the purposes stated in Section 4. We do not use your data for automated decision-making or profiling.</p>
                </>
            ),
        },
        {
            title: "6. Data Sharing",
            content: (
                <>
                    <p>We may share your personal data with the following third-party service providers who act as data processors:</p>
                    <ul>
                        <li><strong>Cloudinary:</strong> For secure storage and delivery of profile images</li>
                        <li><strong>Gmail (Google):</strong> For sending order confirmation and notification emails</li>
                    </ul>
                    <p>We do <strong>not</strong> sell, trade, or otherwise transfer your personal data to third parties for marketing or other unrelated purposes.</p>
                </>
            ),
        },
        {
            title: "7. Data Retention",
            content: (
                <>
                    <p>We retain your personal data for the following periods:</p>
                    <ul>
                        <li><strong>Staff Data:</strong> Duration of employment plus audit retention period</li>
                        <li><strong>Customer Order Data:</strong> Ten (10) years from the date of transaction, in compliance with Bureau of Internal Revenue (BIR) requirements for sales records</li>
                        <li><strong>Audit Logs:</strong> Two (2) years from the date of creation</li>
                    </ul>
                </>
            ),
        },
        {
            title: "8. Data Security",
            content: (
                <>
                    <p>We implement appropriate technical and organizational security measures to protect your personal data, including:</p>
                    <ul>
                        <li>Password hashing using bcrypt</li>
                        <li>Secure authentication via JSON Web Tokens (JWT) with httpOnly cookies</li>
                        <li>IP address restrictions for staff access</li>
                        <li>Role-based access control (RBAC) to limit data access based on job function</li>
                        <li>Regular security audits and access reviews</li>
                    </ul>
                </>
            ),
        },
        {
            title: "9. Your Rights as a Data Subject",
            content: (
                <>
                    <p>Under the Data Privacy Act of 2012 (RA 10173), you have the following rights:</p>
                    <ul>
                        <li><strong>Right to be Informed:</strong> To know how your personal data is collected and processed</li>
                        <li><strong>Right of Access:</strong> To obtain a copy of your personal data</li>
                        <li><strong>Right to Object:</strong> To refuse or stop the processing of your personal data</li>
                        <li><strong>Right to Erasure:</strong> To request deletion of your personal data, subject to legal retention requirements</li>
                        <li><strong>Right to Rectification:</strong> To correct any inaccurate personal data</li>
                        <li><strong>Right to Data Portability:</strong> To obtain your data in a structured, commonly used format</li>
                        <li><strong>Right to File a Complaint:</strong> To lodge a complaint with the National Privacy Commission (NPC)</li>
                    </ul>
                    <p>To exercise any of these rights, please contact us using the information in Section 10.</p>
                </>
            ),
        },
        {
            title: "10. Contact Us",
            content: (
                <>
                    <p>For questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact:</p>
                    <div className="privacy-contact-card">
                        <p><strong>Abbey's Kitchenette</strong></p>
                        <p>Robledo Compound, Bulacnin, Lipa City</p>
                        <p>Phone: 0929 781 1212</p>
                        <p>Email: maryrosemendoza78@yahoo.com</p>
                    </div>
                </>
            ),
        },
        {
            title: "11. National Privacy Commission",
            content: (
                <>
                    <p>If you believe your data privacy rights have been violated, you may file a complaint with:</p>
                    <div className="privacy-contact-card">
                        <p><strong>National Privacy Commission (NPC)</strong></p>
                        <p>28th Floor, Tower 1, Rockwell Business Center, Ortigas Center, Pasig City</p>
                        <p>Phone: (02) 8234-2228</p>
                        <p>Email: complaints@privacy.gov.ph</p>
                        <p>Website: www.privacy.gov.ph</p>
                    </div>
                </>
            ),
        },
        {
            title: "12. Changes to This Policy",
            content: (
                <>
                    <p>We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date. We encourage you to review this page periodically.</p>
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
                        <h1 className="privacy-title">Privacy Policy</h1>
                        <p className="privacy-subtitle">
                            Your privacy matters to us. Learn how we collect, use, and protect
                            your personal data in compliance with the Philippine Data Privacy Act
                            of 2012 (RA 10173).
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
