import { useStoreSettings } from "../query";

/** Public business settings keep legal-page contacts aligned with the storefront. */
export default function LegalContact() {
    const { data } = useStoreSettings();
    const settings = data?.data || {};
    return (
        <div className="privacy-contact-card">
            <p><strong>{settings.storeName || "Abbey's Kitchenette"}</strong></p>
            <p>{settings.storeAddress || "Robledo Compound, Bulacnin, Lipa City"}</p>
            {settings.storePhone && <p>Phone: <a href={`tel:${settings.storePhone.replace(/[^+0-9]/g, "")}`}>{settings.storePhone}</a></p>}
            {settings.storeEmail && <p>Email: <a href={`mailto:${settings.storeEmail}`}>{settings.storeEmail}</a></p>}
            {!settings.storePhone && !settings.storeEmail && <p>Please contact store staff in person for assistance.</p>}
        </div>
    );
}
