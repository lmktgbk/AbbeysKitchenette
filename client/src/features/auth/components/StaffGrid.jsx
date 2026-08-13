import { useState, useEffect } from "react";
import { getStaffListRequest } from "../api";
import Icon from "@/components/ui/icon";

/**
 * StaffGrid
 * Fetches staff list and displays a selection grid for PIN login.
 * Calls onStaffSelect when a staff member is tapped.
 */
export default function StaffGrid({ onStaffSelect }) {
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        getStaffListRequest()
            .then((res) => setStaffList(res.data.staff))
            .catch(() => setError("Failed to load staff list."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-center text-sm font-medium">Select your name</p>
            <div className="grid grid-cols-3 gap-3">
                {staffList.map((staff) => (
                    <button
                        key={staff.id}
                        onClick={() => onStaffSelect(staff)}
                        className="staff-card"
                    >
                        <Icon name="user" size={24} className="text-muted-foreground" />
                        <span className="text-sm font-medium">{staff.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
