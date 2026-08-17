import { useState } from "react";
import { Link } from "react-router-dom";
import AuthBranding from "../components/AuthBranding";
import StaffGrid from "../components/StaffGrid";
import PinEntry from "../components/PinEntry";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />

                <div className="mt-8">
                    {view === "staff" && (
                        <div key="staff" className="animate-in fade-in-0 duration-300">
                            <StaffGrid onStaffSelect={handleStaffSelect} />
                            <div className="mt-6 text-center">
                                <Button
                                    variant="ghost"
                                    fullWidth
                                    onClick={() => setView("email")}
                                >
                                    Access Admin →
                                </Button>
                            </div>
                        </div>
                    )}

                    {view === "pin" && (
                        <div key="pin" className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
                            <PinEntry
                                selectedStaff={selectedStaff}
                                onBack={handleBackToStaff}
                            />
                        </div>
                    )}

                    {view === "email" && (
                        <div key="email" className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
                            <EmailForm onBack={handleBackToStaff} />
                        </div>
                    )}
                </div>

                {view === "email" && (
                    <div className="mt-4 text-center">
                        <Button variant="ghost" size="sm" asChild>
                            <Link to="/forgot-password">Forgot password?</Link>
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
}
