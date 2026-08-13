import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyOtpRequest, resendOtpRequest } from "../api";
import useAuthStore from "@/features/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import PrimarySpinner from "@/components/ui/spinner";
import { toast } from "sonner";

/**
 * OtpForm
 * Standalone OTP verification form for admin 2FA.
 * Used as a dedicated OTP page if needed in the future.
 */
export default function OtpForm({ userId }) {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const navigate = useNavigate();

    const handleVerify = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = await verifyOtpRequest(userId, code);
            const { user } = data.data;
            setUser(user);
            toast.success("Login Successful", {
                description: `Welcome, ${user.name}!`,
            });
            navigate("/dashboard");
        } catch (err) {
            setError(
                err.response?.data?.message || "Invalid or expired OTP code."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            await resendOtpRequest(userId);
            toast.success("OTP Sent", { description: "Check your email for a new code." });
        } catch {
            toast.error("Failed to resend OTP");
        } finally {
            setResending(false);
        }
    };

    if (loading) return <PrimarySpinner />;

    return (
        <form onSubmit={handleVerify} className="space-y-4 text-center">
            <Icon name="mail" size={32} className="mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Enter the 6-digit code sent to your email</p>

            {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="mx-auto max-w-[200px] text-center text-lg tracking-[0.5em]"
                autoFocus
            />

            <div className="flex flex-col gap-2">
                <Button type="submit" disabled={code.length < 6}>
                    Verify
                </Button>
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="text-sm text-muted-foreground hover:text-foreground"
                >
                    {resending ? "Sending..." : "Resend OTP"}
                </button>
            </div>
        </form>
    );
}