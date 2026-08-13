import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequest, verifyOtpRequest, resendOtpRequest } from "../api";
import useAuthStore from "@/features/auth/authStore";
import { loginSchema } from "../authValidation";
import Icon from "@/components/ui/icon";
import PrimarySpinner from "@/components/ui/spinner";
import { toast } from "sonner";

/**
 * EmailForm
 * Email + password login form.
 * Used as alternate login method for staff, and primary for admin.
 */
export default function EmailForm({ onBack }) {
    const [serverError, setServerError] = useState("");
    const [otpData, setOtpData] = useState(null);
    const setUser = useAuthStore((s) => s.setUser);
    const navigate = useNavigate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");

        try {
            const result = await loginRequest(data.email, data.password);

            // Admin requires OTP
            if (result.data.requiresOtp) {
                setOtpData(result.data);
                return;
            }

            const { user } = result.data;
            setUser(user);
            toast.success("Login Successful", {
                description: `Welcome, ${user.name}!`,
            });

            switch (user.role) {
                case "admin": navigate("/dashboard"); break;
                case "cashier": navigate("/pos"); break;
                case "kitchen": navigate("/kitchen"); break;
                default: navigate("/dashboard");
            }
        } catch (err) {
            setServerError(
                err.response?.data?.message || "Login failed. Please try again."
            );
        }
    };

    // If admin OTP is required, render OTP form inline
    if (otpData) {
        return <OtpInline userId={otpData.user.id} />;
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-slide-in">
            {serverError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {serverError}
                </div>
            )}

            <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="input-auth"
                    {...register("email")}
                />
                {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
            </div>

            <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                    Password
                </label>
                <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="input-auth"
                    {...register("password")}
                />
                {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
            </div>

            <button type="submit" className="btn-auth" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            {onBack && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={onBack}
                        className="link-auth"
                    >
                        <Icon name="arrowLeft" size={14} className="inline" /> Back to staff login
                    </button>
                </div>
            )}
        </form>
    );
}

/**
 * OtpInline
 * Inline OTP verification for admin 2FA.
 * Renders inside EmailForm when admin login returns requiresOtp.
 */
function OtpInline({ userId }) {
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
        <form onSubmit={handleVerify} className="space-y-5 text-center animate-slide-in">
            <Icon name="mail" size={32} className="mx-auto text-primary" />
            <p className="text-sm font-medium">Enter the 6-digit code sent to your email</p>

            {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="input-auth mx-auto max-w-[200px] text-center text-lg tracking-[0.5em]"
                autoFocus
            />

            <div className="flex flex-col gap-3">
                <button type="submit" className="btn-auth" disabled={code.length < 6}>
                    Verify
                </button>
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="link-auth"
                >
                    {resending ? "Sending..." : "Resend OTP"}
                </button>
            </div>
        </form>
    );
}
