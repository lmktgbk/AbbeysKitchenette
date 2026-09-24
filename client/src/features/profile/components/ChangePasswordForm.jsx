import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { changePasswordSchema } from "../validation";

/**
 * ChangePasswordForm
 *
 * Change own password with current + new + confirm fields.
 */
export default function ChangePasswordForm({ mutation }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  function handleFormSubmit(data) {
    mutation.changePassword.mutate(
      {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      },
      { onSuccess: () => reset() },
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Current Password
        </label>
        <PasswordInput
          placeholder="Enter current password"
          autoComplete="current-password"
          ariaLabel="current password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          New Password
        </label>
        <PasswordInput
          placeholder="Min. 8 characters"
          autoComplete="new-password"
          ariaLabel="new password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Confirm New Password
        </label>
        <PasswordInput
          placeholder="Re-enter new password"
          autoComplete="new-password"
          ariaLabel="confirm password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.changePassword.isPending}>
          {mutation.changePassword.isPending
            ? "Changing..."
            : "Change Password"}
        </Button>
      </div>
    </form>
  );
}
