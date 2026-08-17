import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequest } from "../api";
import useAuthStore from "@/features/auth/authStore";
import { loginSchema } from "../authValidation";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OtpForm from "./OtpForm";
import { toast } from "sonner";

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

    if (otpData) {
        return <OtpForm userId={otpData.user.id} />;
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-in fade-in-0 slide-in-from-right-3 duration-300">
            {serverError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {serverError}
                </div>
            )}

            <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                    Email
                </label>
                <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    error={errors.email?.message}
                    {...register("email")}
                />
            </div>

            <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                    Password
                </label>
                <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    error={errors.password?.message}
                    {...register("password")}
                />
            </div>

            <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>

            {onBack && (
                <div className="text-center">
                    <Button type="button" variant="ghost" onClick={onBack}>
                        <Icon name="arrowLeft" size={14} /> Back to staff login
                    </Button>
                </div>
            )}
        </form>
    );
}
