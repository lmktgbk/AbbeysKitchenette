import { useState, useEffect } from "react";
import { getStaffListRequest } from "../api";
import Icon from "@/components/ui/icon";

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
            <p className="text-center text-sm font-medium">Select your profile</p>
            <div className="grid grid-cols-3 gap-3">
                {staffList.map((staff) => (
                    <button
                        key={staff.id}
                        onClick={() => onStaffSelect(staff)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/40 p-4 cursor-pointer transition-all hover:border-primary hover:bg-card/70 hover:-translate-y-0.5"
                    >
                        <Icon name="user" size={24} className="text-muted-foreground" />
                        <span className="text-sm font-medium">{staff.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
