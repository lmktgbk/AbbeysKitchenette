import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilterPill } from "@/components/filters/FilterPill";
import { useSettings, useUpdateSettings } from "../query";
import { generalSchema, businessSchema, securitySchema, notificationsSchema } from "../validation";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { value: "general", label: "General" },
  { value: "business", label: "Business" },
  { value: "security", label: "Security" },
  { value: "notifications", label: "Notifications" },
];

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

const DEFAULT_HOURS = {
  monday: { enabled: true, open: "08:00", close: "20:00" },
  tuesday: { enabled: true, open: "08:00", close: "20:00" },
  wednesday: { enabled: true, open: "08:00", close: "20:00" },
  thursday: { enabled: true, open: "08:00", close: "20:00" },
  friday: { enabled: true, open: "08:00", close: "20:00" },
  saturday: { enabled: true, open: "08:00", close: "20:00" },
  sunday: { enabled: false, open: "08:00", close: "20:00" },
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your store settings</p>
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your store settings</p>
      </div>

      <FilterPill options={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === "general" && <GeneralTab settings={settings} onSave={updateMutation.mutateAsync} isSaving={updateMutation.isPending} />}
      {activeTab === "business" && <BusinessTab settings={settings} onSave={updateMutation.mutateAsync} isSaving={updateMutation.isPending} />}
      {activeTab === "security" && <SecurityTab settings={settings} onSave={updateMutation.mutateAsync} isSaving={updateMutation.isPending} />}
      {activeTab === "notifications" && <NotificationsTab settings={settings} onSave={updateMutation.mutateAsync} isSaving={updateMutation.isPending} />}
    </div>
  );
}

/* ── General Tab ──────────────────────────── */

function GeneralTab({ settings, onSave, isSaving }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      storeName: settings?.storeName || "",
      storeEmail: settings?.storeEmail || "",
      storeAddress: settings?.storeAddress || "",
      storePhone: settings?.storePhone || "",
      storeHours: settings?.storeHours || DEFAULT_HOURS,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        storeName: settings.storeName || "",
        storeEmail: settings.storeEmail || "",
        storeAddress: settings.storeAddress || "",
        storePhone: settings.storePhone || "",
        storeHours: settings.storeHours || DEFAULT_HOURS,
      });
    }
  }, [settings, reset]);

  const storeHours = watch("storeHours");

  function toggleDay(dayKey) {
    const current = storeHours[dayKey];
    setValue(`storeHours.${dayKey}`, { ...current, enabled: !current.enabled }, { shouldValidate: true });
  }

  function updateTime(dayKey, field, value) {
    const current = storeHours[dayKey];
    setValue(`storeHours.${dayKey}`, { ...current, [field]: value }, { shouldValidate: true });
  }

  function onSubmit(data) {
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Store Information</CardTitle>
          <CardDescription>Your store details displayed on receipts and the ordering page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Store Name</label>
              <Input placeholder="Abbey's Kitchenette" error={errors.storeName?.message} {...register("storeName")} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Store Email</label>
              <Input type="email" placeholder="contact@abbey.com" error={errors.storeEmail?.message} {...register("storeEmail")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Phone</label>
              <Input placeholder="09171234567" error={errors.storePhone?.message} {...register("storePhone")} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Address</label>
              <Input placeholder="123 Main St, Manila" error={errors.storeAddress?.message} {...register("storeAddress")} />
            </div>
          </div>
        </CardContent>

        <CardHeader className="border-t">
          <CardTitle>Store Hours</CardTitle>
          <CardDescription>Set your operating hours. Customers can only place orders when the store is open.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAYS.map(({ key, label }) => {
              const day = storeHours[key];
              return (
                <div key={key} className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={`w-16 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      day.enabled
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                  {day.enabled ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.open}
                        onChange={(e) => updateTime(key, "open", e.target.value)}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={day.close}
                        onChange={(e) => updateTime(key, "close", e.target.value)}
                        className="w-32"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ── Business Tab ──────────────────────────── */

function BusinessTab({ settings, onSave, isSaving }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      taxRate: settings?.taxRate ?? 0,
      comboDiscountPercent: settings?.comboDiscountPercent ?? 15,
      minMarginPercent: settings?.minMarginPercent ?? 30,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        taxRate: settings.taxRate ?? 0,
        comboDiscountPercent: settings.comboDiscountPercent ?? 15,
        minMarginPercent: settings.minMarginPercent ?? 30,
      });
    }
  }, [settings, reset]);

  function onSubmit(data) {
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Configure tax rate, combo discounts, and minimum margin thresholds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Tax Rate (%)</label>
              <Input type="number" step="0.5" min="0" max="100" error={errors.taxRate?.message} {...register("taxRate")} />
              <p className="mt-1.5 text-xs text-muted-foreground">Applied to order totals at checkout</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Combo Discount (%)</label>
              <Input type="number" step="1" min="0" max="100" error={errors.comboDiscountPercent?.message} {...register("comboDiscountPercent")} />
              <p className="mt-1.5 text-xs text-muted-foreground">Used by Market Basket combo pricing</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Minimum Margin (%)</label>
              <Input type="number" step="1" min="0" max="100" error={errors.minMarginPercent?.message} {...register("minMarginPercent")} />
              <p className="mt-1.5 text-xs text-muted-foreground">Floor for combo and price optimization</p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ── Security Tab ──────────────────────────── */

function SecurityTab({ settings, onSave, isSaving }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(securitySchema),
    defaultValues: {
      storeIpWhitelist: settings?.storeIpWhitelist || "",
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        storeIpWhitelist: settings.storeIpWhitelist || "",
      });
    }
  }, [settings, reset]);

  function onSubmit(data) {
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>IP Whitelist</CardTitle>
          <CardDescription>Restrict staff PIN login to specific IP addresses (store devices only).</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Allowed IP Addresses</label>
            <Textarea
              placeholder={"192.168.1.100, 192.168.1.101, 10.0.0.1"}
              rows={3}
              error={errors.storeIpWhitelist?.message}
              {...register("storeIpWhitelist")}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Comma-separated IP addresses. Leave empty to allow all IPs.</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ── Notifications Tab ──────────────────────────── */

function NotificationsTab({ settings, onSave, isSaving }) {
  const {
    handleSubmit,
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      notifyLowStock: settings?.notifyLowStock ?? true,
      notifyNewOrders: settings?.notifyNewOrders ?? true,
      notifyDailyReport: settings?.notifyDailyReport ?? false,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        notifyLowStock: settings.notifyLowStock ?? true,
        notifyNewOrders: settings.notifyNewOrders ?? true,
        notifyDailyReport: settings.notifyDailyReport ?? false,
      });
    }
  }, [settings, reset]);

  function onSubmit(data) {
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Configure how you receive alerts and reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Low Stock Alerts"
            description="Get notified when ingredient stock falls below the minimum threshold"
            checked={watch("notifyLowStock")}
            onChange={(val) => setValue("notifyLowStock", val, { shouldValidate: true })}
          />
          <ToggleRow
            label="New Order Notifications"
            description="In-app notification when a new order is placed"
            checked={watch("notifyNewOrders")}
            onChange={(val) => setValue("notifyNewOrders", val, { shouldValidate: true })}
          />
          <ToggleRow
            label="Daily Report"
            description="Receive a daily summary report via email (coming soon)"
            checked={watch("notifyDailyReport")}
            onChange={(val) => setValue("notifyDailyReport", val, { shouldValidate: true })}
            disabled
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ── Toggle Row ──────────────────────────── */

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
