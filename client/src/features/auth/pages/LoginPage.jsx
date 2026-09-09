import { useState } from "react";
import AuthBranding from "../components/AuthBranding";
import StaffGrid from "../components/StaffGrid";
import PinEntry from "../components/PinEntry";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";

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
                </div>
            </div>
        </Card>
    );
}
