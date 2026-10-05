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
 * Opened by account menus; each tab mounts its own form and unmounting discards that form’s draft.
 */
export default function ProfileModal({ open, onOpenChange }) {
  const [activeTab, setActiveTab] = useState("profile");
  const mutation = useProfileMutations();

  /** Returns the next modal opening to the profile tab; parent visibility controls the dialog lifecycle. */
  function handleClose() {
    setActiveTab("profile");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-md flex-col overflow-hidden">
        <DialogClose onClick={handleClose} />
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-border">
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

        {/* Keep the title and tabs visible when verification fields exceed the viewport. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain pt-2">
          {activeTab === "profile" && <ProfileForm mutation={mutation} />}
          {activeTab === "password" && <ChangePasswordForm mutation={mutation} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
