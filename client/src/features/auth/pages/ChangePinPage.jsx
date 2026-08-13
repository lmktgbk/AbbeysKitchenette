import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePinRequest } from "../api";
import { changePinSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import Icon from "@/components/ui/icon";
import { toast } from "sonner";

/**
 * ChangePinPage
 * Forced PIN change after mustChangePwd.
 * Shown after staff logs in with admin-reset temporary PIN.
 */
export default function ChangePinPage() {
    const navigate = useNavigate();
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(changePinSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");
        try {
            await changePinRequest(data.newPin);
            toast.success("PIN Changed", { description: "Your new PIN is now active." });
            navigate("/pos");
        } catch (err) {
            setServerError(
                err.response?.data?.message || "Failed to change PIN. Please try again."
            );
        }
    };

    return (
        <div className="relative">
            <div className="glass-card p-8">
                <div className="animate-fade-in">
                    <AuthBranding />

                    <div className="mt-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-slide-in">
                            <div className="text-center">
                                <h2 className="text-lg font-semibold">Set New PIN</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    You must set a new PIN before continuing.
                                </p>
                            </div>

                            {serverError && (
                                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                    {serverError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="newPin" className="text-sm font-medium">
                                    New PIN
                                </label>
                                <input
                                    id="newPin"
                                    type="password"
                                    placeholder="4-6 digits"
                                    maxLength={6}
                                    className="input-auth"
                                    {...register("newPin")}
                                />
                                {errors.newPin && (
                                    <p className="text-sm text-destructive">{errors.newPin.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="confirmPin" className="text-sm font-medium">
                                    Confirm PIN
                                </label>
                                <input
                                    id="confirmPin"
                                    type="password"
                                    placeholder="Re-enter PIN"
                                    maxLength={6}
                                    className="input-auth"
                                    {...register("confirmPin")}
                                />
                                {errors.confirmPin && (
                                    <p className="text-sm text-destructive">{errors.confirmPin.message}</p>
                                )}
                            </div>

                            <button type="submit" className="btn-auth" disabled={isSubmitting}>
                                {isSubmitting ? "Setting..." : "Set New PIN"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
