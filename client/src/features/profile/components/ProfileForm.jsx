import { useRef } from "react";
import { useForm } from "react-hook-form";
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
  const user = useAuthStore((s) => s.user);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
    },
  });

  function handleFormSubmit(data) {
    mutation.updateProfile.mutate(data);
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
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Avatar */}
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

      {/* Name */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Name
        </label>
        <Input
          placeholder="Your name"
          error={errors.name?.message}
          {...register("name")}
        />
      </div>

      {/* Email */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Email
        </label>
        <Input
          type="email"
          placeholder="Your email"
          error={errors.email?.message}
          {...register("email")}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.updateProfile.isPending}>
          {mutation.updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
