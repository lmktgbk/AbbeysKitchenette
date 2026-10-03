import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useAuthStore from "@/features/auth/authStore";
import { updateProfileSchema } from "../validation";

/**
 * ProfileForm
 *
 * Edit name + email with avatar upload.
 * Avatar: circular image or initials fallback, click to upload.
 */
export default function ProfileForm({ mutation }) {
  const fileInputRef = useRef(null);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [code, setCode] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const user = useAuthStore((s) => s.user);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
    },
  });

  const emailChanged = useWatch({ control, name: "email" }) !== user?.email;
  function handleFormSubmit(data) {
    if (pendingEmail) {
      mutation.confirmEmailChange.mutate({ id: pendingEmail.id, code }, {
        onSuccess: (res) => {
          setPendingEmail(null); setCode("");
          setValue("email", res.data.user.email);
        },
      });
      return;
    }
    if (emailChanged && !data.currentPassword) {
      setPasswordError("Confirm your current password to change your email");
      return;
    }
    setPasswordError("");
    mutation.updateProfile.mutate(data, {
      onSuccess: (res) => {
        setValue("currentPassword", "");
        setPendingEmail(res.data.emailChange || null);
      },
    });
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      mutation.uploadImage.mutate(file);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <form onSubmit={pendingEmail ? (event) => { event.preventDefault(); handleFormSubmit({}); } : handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full"
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={user.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-xl font-semibold text-primary-foreground">
              {initials}
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Icon name="camera" size={20} className="text-white" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {mutation.uploadImage.isPending ? "Uploading..." : "Change Photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Name
        </label>
        <Input
          disabled={!!pendingEmail}
          placeholder="Your name"
          error={errors.name?.message}
          {...register("name")}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Email
        </label>
        <Input
          type="email"
          disabled={!!pendingEmail}
          placeholder="Your email"
          error={errors.email?.message}
          {...register("email")}
        />
      </div>

      {emailChanged && !pendingEmail && (
        <div>
          <label htmlFor="email-change-password" className="mb-1.5 block text-sm font-semibold">Current password</label>
          <Input id="email-change-password" type="password" autoComplete="current-password"
            error={passwordError || errors.currentPassword?.message} {...register("currentPassword")} />
          <p className="mt-2 text-sm text-muted-foreground">Your current email stays active until you verify the new address.</p>
        </div>
      )}
      {pendingEmail && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm">Enter the code sent to {pendingEmail.email}. It expires in ten minutes.</p>
          <label htmlFor="email-change-code" className="block text-sm font-semibold">Verification code</label>
          <Input id="email-change-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} required pattern="[0-9]{6}" />
          <Button type="button" variant="outline" disabled={mutation.confirmEmailChange.isPending}
            onClick={() => { setPendingEmail(null); setCode(""); }}>Request another code or address</Button>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.updateProfile.isPending || mutation.confirmEmailChange.isPending}>
          {mutation.updateProfile.isPending || mutation.confirmEmailChange.isPending ? "Saving..." : pendingEmail ? "Verify Email" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
