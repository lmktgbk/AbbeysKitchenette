import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginPinRequest } from "../api";
import useAuthStore from "@/features/auth/authStore";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function PinEntry({ selectedStaff, onBack }) {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = await loginPinRequest(selectedStaff.id, pin);
            const { user, mustChangePin } = data.data;
            setUser(user);

            if (mustChangePin) {
                navigate("/change-pin");
            } else {
                toast.success("Login Successful", {
                    description: `Welcome, ${user.name}!`,
                });
                navigate(user.role === "kitchen" ? "/kitchen" : "/pos");
            }
        } catch (err) {
            setError(
                err.response?.data?.message || "Invalid PIN. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5 text-center animate-in fade-in-0 slide-in-from-right-3 duration-300">
            <Icon name="user" size={32} className="mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
                Welcome, <span className="font-medium text-foreground">{selectedStaff.name}</span>!
            </p>
            <p className="text-sm font-medium">Enter your PIN</p>

            {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                maxLength={6}
                className="mx-auto max-w-[200px] text-center text-lg tracking-[0.5em]"
                autoFocus
                disabled={loading}
            />

            <div className="flex flex-col gap-3">
                <Button type="submit" fullWidth disabled={pin.length < 4 || loading}>
                    {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
                    <Icon name="arrowLeft" size={14} /> Back to staff list
                </Button>
            </div>
        </form>
    );
}
