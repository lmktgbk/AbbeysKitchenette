import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProfileMutations } from "../query";
import ProfileForm from "./ProfileForm";
import ChangePasswordForm from "./ChangePasswordForm";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "password", label: "Password" },
];

/**
 * ProfileModal
 *
 * Modal with 2 tabs: Profile (name, email, avatar) and Password (change password).
 * Triggered from AvatarDropdown.
 */
export default function ProfileModal({ open, onOpenChange }) {
  const [activeTab, setActiveTab] = useState("profile");
  const mutation = useProfileMutations();

  function handleClose() {
    setActiveTab("profile");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors -mb-px",
                activeTab === tab.key
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pt-2">
          {activeTab === "profile" && <ProfileForm mutation={mutation} />}
          {activeTab === "password" && <ChangePasswordForm mutation={mutation} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
