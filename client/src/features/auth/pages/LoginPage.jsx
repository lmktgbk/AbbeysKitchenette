import { useState } from "react";
import { Link } from "react-router-dom";
import AuthBranding from "../components/AuthBranding";
import StaffGrid from "../components/StaffGrid";
import PinEntry from "../components/PinEntry";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";

/**
 * LoginPage
 * Main login page with 3 views:
 *   1. "staff" — staff selection grid (default)
 *   2. "pin" — PIN entry after selecting a staff member
 *   3. "email" — email + password form
 *
 * View state managed here, each view is a separate component.
 * Uses glassmorphism card with smooth view transitions.
 */
export default function LoginPage() {
    const [view, setView] = useState("staff");
    const [selectedStaff, setSelectedStaff] = useState(null);

    const handleStaffSelect = (staff) => {
        setSelectedStaff(staff);
        setView("pin");
    };

    const handleBackToStaff = () => {
        setSelectedStaff(null);
        setView("staff");
    };

    return (
        <div className="glass-card relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="animate-fade-in">
                <AuthBranding />

                <div className="mt-8">
                    {/* View: Staff Selection Grid */}
                    {view === "staff" && (
                        <div key="staff" className="animate-fade-in">
                            <StaffGrid onStaffSelect={handleStaffSelect} />
                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => setView("email")}
                                    className="link-auth"
                                >
                                    Login with email instead →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* View: PIN Entry */}
                    {view === "pin" && (
                        <div key="pin" className="animate-slide-in">
                            <PinEntry
                                selectedStaff={selectedStaff}
                                onBack={handleBackToStaff}
                            />
                        </div>
                    )}

                    {/* View: Email Login */}
                    {view === "email" && (
                        <div key="email" className="animate-slide-in">
                            <EmailForm onBack={handleBackToStaff} />
                        </div>
                    )}
                </div>

                {/* Forgot password link */}
                {view === "email" && (
                    <div className="mt-4 text-center">
                        <Link
                            to="/forgot-password"
                            className="link-auth"
                        >
                            Forgot password?
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
