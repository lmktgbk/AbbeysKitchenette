/**
 * SettingsPage — store settings editor (profile, hours, payments, automation schedules).
 * WHY it exists: single admin form syncing public storefront + POS + automation config.
 * Query keys consumed: ["settings"] via useSettings (update via useUpdateSettings).
 * Guards: admin-only route; no BR-02 shift gate, no per-role branching.
 * State: Query [settings] | local [] (react-hook-form only) | Zustand [].
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import { useSettings, useUpdateSettings } from "../query";
import { useSettingsRealtime } from "@/realtime/subscriptions";
import { settingsSchema } from "../validation";
import { Skeleton } from "@/components/ui/skeleton";

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
  monday:    { enabled: true,  open: "08:00", close: "20:00" },
  tuesday:   { enabled: true,  open: "08:00", close: "20:00" },
  wednesday: { enabled: true,  open: "08:00", close: "20:00" },
  thursday:  { enabled: true,  open: "08:00", close: "20:00" },
  friday:    { enabled: true,  open: "08:00", close: "20:00" },
  saturday:  { enabled: true,  open: "08:00", close: "20:00" },
  sunday:    { enabled: false, open: "08:00", close: "20:00" },
};

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash", hint: "Bills & coins" },
  { value: "gcash", label: "GCash", hint: "E-wallet" },
  { value: "maya", label: "Maya", hint: "E-wallet" },
];

const AUTOMATION_JOBS = [
  { key: "forecast", label: "Demand Forecast", hint: "Fresh predictions before opening" },
  { key: "reorder", label: "Reorder Suggestions", hint: "Morning stock suggestions" },
  { key: "waste", label: "Waste Reduction", hint: "Weekly overstock insights" },
  { key: "marketBasket", label: "Market Basket", hint: "Weekly combo analysis" },
  // Daily-only: emailed yesterday-in-review for admins (no frequency choice).
  { key: "dailyReport", label: "Daily Report", hint: "Yesterday's numbers emailed to all active admins", dailyOnly: true },
];

const DEFAULT_AUTOMATION = {
  forecast: { enabled: true, frequency: "daily", day: "monday", time: "05:00" },
  reorder: { enabled: true, frequency: "daily", day: "monday", time: "05:30" },
  waste: { enabled: false, frequency: "weekly", day: "monday", time: "06:00" },
  marketBasket: { enabled: false, frequency: "weekly", day: "sunday", time: "23:00" },
  dailyReport: { enabled: false, frequency: "daily", day: "monday", time: "00:30" },
};

const DEFAULT_DINING_TABLES = {
  tables: Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    label: `Table ${i + 1}`,
    enabled: true,
  })),
  takeoutEnabled: true,
};

function mergeDiningTables(saved) {
  if (!saved || typeof saved !== "object") return DEFAULT_DINING_TABLES;
  return {
    tables: Array.isArray(saved.tables) ? saved.tables : [],
    takeoutEnabled: saved.takeoutEnabled ?? true,
  };
}

function mergeAutomation(saved) {
  const merged = {};
  for (const { key } of AUTOMATION_JOBS) {
    merged[key] = { ...DEFAULT_AUTOMATION[key], ...(saved?.[key] ?? {}) };
  }
  return merged;
}

export default function SettingsPage() {
  // Live settings: writes elsewhere refresh this form's source data.
  useSettingsRealtime();
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const {
    register, handleSubmit, reset, watch, setValue, getValues, trigger,
    formState: { errors, isDirty, dirtyFields },
  } = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      storeName: "",
      storeEmail: "",
      storeAddress: "",
      storePhone: "",
      storeHours: DEFAULT_HOURS,
      storeIpWhitelist: "",
      acceptedPayments: ["cash", "gcash", "maya"],
      automation: DEFAULT_AUTOMATION,
      diningTables: DEFAULT_DINING_TABLES,
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
        storeIpWhitelist: settings.storeIpWhitelist || "",
        acceptedPayments: settings.acceptedPayments?.length ? settings.acceptedPayments : ["cash", "gcash", "maya"],
        automation: mergeAutomation(settings.automation),
        diningTables: mergeDiningTables(settings.diningTables),
      });
    }
  }, [settings, reset]);

  const storeHours = watch("storeHours");
  const whitelist = watch("storeIpWhitelist");
  const openMode = !whitelist || whitelist.trim() === "";
  const accepted = watch("acceptedPayments") ?? [];
  const automation = watch("automation") ?? DEFAULT_AUTOMATION;

  function togglePayment(value) {
    const current = getValues("acceptedPayments") ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setValue("acceptedPayments", next, { shouldValidate: true, shouldDirty: true });
  }

  function updateAutomation(jobKey, field, value) {
    const current = getValues(`automation.${jobKey}`) ?? {};
    const next = { ...current, [field]: value };
    // Switching to weekly without a weekday is invalid — default to Monday.
    if (field === "frequency" && value === "weekly" && !next.day) {
      next.day = "monday";
    }
    setValue(`automation.${jobKey}`, next, { shouldValidate: true, shouldDirty: true });
  }

  function toggleDay(dayKey) {
    const current = storeHours[dayKey];
    setValue(`storeHours.${dayKey}`, { ...current, enabled: !current.enabled }, { shouldValidate: true, shouldDirty: true });
  }

  function updateTime(dayKey, field, value) {
    const current = storeHours[dayKey];
    setValue(`storeHours.${dayKey}`, { ...current, [field]: value }, { shouldValidate: true, shouldDirty: true });
  }

  const diningTables = watch("diningTables") ?? DEFAULT_DINING_TABLES;
  const diningRows = diningTables.tables ?? [];

  function updateDiningTable(index, field, value) {
    const current = getValues("diningTables") ?? DEFAULT_DINING_TABLES;
    const tables = (current.tables ?? []).map((t, i) => (i === index ? { ...t, [field]: value } : t));
    setValue("diningTables", { ...current, tables }, { shouldValidate: true, shouldDirty: true });
  }

  function addDiningTable() {
    const current = getValues("diningTables") ?? DEFAULT_DINING_TABLES;
    const tables = [...(current.tables ?? [])];
    tables.push({ id: `t${Date.now()}`, label: `Table ${tables.length + 1}`, enabled: true });
    setValue("diningTables", { ...current, tables }, { shouldValidate: true, shouldDirty: true });
  }

  function removeDiningTable(index) {
    const current = getValues("diningTables") ?? DEFAULT_DINING_TABLES;
    const tables = (current.tables ?? []).filter((_, i) => i !== index);
    setValue("diningTables", { ...current, tables }, { shouldValidate: true, shouldDirty: true });
  }

  function toggleTakeout() {
    const current = getValues("diningTables") ?? DEFAULT_DINING_TABLES;
    setValue("diningTables", { ...current, takeoutEnabled: !current.takeoutEnabled }, { shouldValidate: true, shouldDirty: true });
  }

  function onSubmit(data) {
    updateMutation.mutate(data);
  }

  // ── Per-section save ───────────────────
  // Each card persists only its own fields: an invalid phone number never
  // blocks saving hours. The server PATCH is partial-safe; after each save
  // the realtime refresh resets the form and clears dirty.
  const SECTION_FIELDS = {
    info: ["storeName", "storeEmail", "storeAddress", "storePhone"],
    hours: ["storeHours"],
    payments: ["acceptedPayments"],
    automation: ["automation"],
    tables: ["diningTables"],
    security: ["storeIpWhitelist"],
  };
  const [savingSection, setSavingSection] = useState(null);

  function isSectionDirty(key) {
    const fields = SECTION_FIELDS[key] ?? [];
    return fields.some((f) => dirtyFields?.[f] !== undefined);
  }

  function saveSection(key) {
    const fields = SECTION_FIELDS[key] ?? [];
    if (!fields.some((f) => dirtyFields?.[f] !== undefined)) return;
    setSavingSection(key);
    // Validate ONLY this section: an invalid phone number must never block
    // saving hours. handleSubmit would validate the whole form instead.
    trigger(fields).then((valid) => {
      if (!valid) {
        setSavingSection(null);
        return;
      }
      const data = getValues();
      const partial = {};
      for (const f of fields) partial[f] = data[f];
      updateMutation.mutate(partial, {
        onSettled: () => setSavingSection((s) => (s === key ? null : s)),
      });
    }).catch(() => setSavingSection(null));
  }

  function SectionSaveButton({ sectionKey }) {
    const dirty = isSectionDirty(sectionKey);
    const saving = savingSection === sectionKey || (updateMutation.isPending && dirty);
    return (
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={!dirty || updateMutation.isPending}
        onClick={() => saveSection(sectionKey)}
      >
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        {isDirty && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
            Unsaved changes
          </span>
        )}
      </div>

      {openMode && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Icon name="info" size={16} className="text-primary" />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-foreground">Open mode — staff can log in from anywhere</p>
            <p className="mt-0.5 text-muted-foreground">
              No IP whitelist set. Add store IPs below to restrict staff logins to store devices.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Store Information */}
        <Card>
          <CardHeader>
            <CardTitle>Store Information</CardTitle>
            <CardDescription>Your store details displayed on receipts and the ordering page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">Store Name</label>
                <Input placeholder="Abbey's Kitchenette" error={errors.storeName?.message} {...register("storeName")} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">Store Email</label>
                <Input type="email" placeholder="contact@abbey.com" error={errors.storeEmail?.message} {...register("storeEmail")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">Phone</label>
                <Input placeholder="09171234567" error={errors.storePhone?.message} {...register("storePhone")} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">Address</label>
                <Input placeholder="123 Main St, Manila" error={errors.storeAddress?.message} {...register("storeAddress")} />
              </div>
            </div>
            <div className="flex justify-end pt-1"><SectionSaveButton sectionKey="info" /></div>
          </CardContent>
        </Card>

        {/* Store Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Store Hours</CardTitle>
            <CardDescription>Set your operating hours. Online customers can only place orders when the store is open.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const day = storeHours[key];
                const dayError =
                  errors.storeHours?.[key]?.message ||
                  errors.storeHours?.[key]?.open?.message ||
                  errors.storeHours?.[key]?.close?.message;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <button type="button" onClick={() => toggleDay(key)}
                      className={`w-16 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        day.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >{label}</button>
                    {day.enabled ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Input type="time" value={day.open} onChange={(e) => updateTime(key, "open", e.target.value)} className="w-32" />
                          <span className="text-sm text-muted-foreground">to</span>
                          <Input type="time" value={day.close} onChange={(e) => updateTime(key, "close", e.target.value)} className="w-32" />
                        </div>
                        {dayError && <p className="text-xs text-destructive">{dayError}</p>}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end"><SectionSaveButton sectionKey="hours" /></div>
          </CardContent>
        </Card>

        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Which payment methods cashiers can accept at the POS. At least one must stay on.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PAYMENT_OPTIONS.map((opt) => {
                const on = accepted.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => togglePayment(opt.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      on ? "border-primary bg-primary/5" : "border-border opacity-60 hover:opacity-100"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{on ? `On — ${opt.hint}` : `Off — ${opt.hint}`}</p>
                  </button>
                );
              })}
            </div>
            {errors.acceptedPayments?.message && (
              <p className="mt-2 text-xs text-destructive">{errors.acceptedPayments.message}</p>
            )}
            <div className="mt-3 flex justify-end"><SectionSaveButton sectionKey="payments" /></div>
          </CardContent>
        </Card>

        {/* Automation */}
        <Card>
          <CardHeader>
            <CardTitle>Automation</CardTitle>
            <CardDescription>Scheduled runs for forecasting and insights. Generating is automatic — reviewing stays manual.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AUTOMATION_JOBS.map(({ key, label, hint, dailyOnly }) => {
                const job = automation[key] ?? DEFAULT_AUTOMATION[key];
                const jobError =
                  errors.automation?.[key]?.message ||
                  errors.automation?.[key]?.time?.message ||
                  errors.automation?.[key]?.day?.message;
                return (
                  <div key={key} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => updateAutomation(key, "enabled", !job.enabled)}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          job.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {job.enabled ? "On" : "Off"}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{hint}</p>
                      </div>
                      {job.enabled && (
                        dailyOnly ? (
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">Daily at</span>
                            <Input
                              type="time"
                              value={job.time}
                              onChange={(e) => updateAutomation(key, "time", e.target.value)}
                              className="w-32"
                            />
                          </div>
                        ) : (
                        <div className="ml-auto grid shrink-0 grid-cols-[6rem_6rem_8rem] items-center gap-2">
                          <select
                            value={job.frequency}
                            onChange={(e) => updateAutomation(key, "frequency", e.target.value)}
                            className="h-9 w-24 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                          </select>
                          <select
                            value={job.day ?? "monday"}
                            onChange={(e) => updateAutomation(key, "day", e.target.value)}
                            disabled={job.frequency !== "weekly"}
                            title={job.frequency !== "weekly" ? "Weekday applies to weekly schedules" : undefined}
                            className="h-9 w-24 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {DAYS.map(({ key: d, label: l }) => (
                              <option key={d} value={d}>{l}</option>
                            ))}
                          </select>
                          <Input
                            type="time"
                            value={job.time}
                            onChange={(e) => updateAutomation(key, "time", e.target.value)}
                            className="w-32"
                          />
                        </div>
                        ))}
                    </div>
                    {job.enabled && jobError && (
                      <p className="mt-1.5 text-xs text-destructive">{jobError}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end"><SectionSaveButton sectionKey="automation" /></div>
          </CardContent>
        </Card>

        {/* Tables */}
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
            <CardDescription>Dining tables offered in the POS and ordering checkout, plus takeout.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {diningRows.map((table, idx) => {
                const tableError = errors.diningTables?.tables?.[idx]?.label?.message;
                return (
                  <div
                    key={table.id ?? idx}
                    className={`rounded-xl border border-border bg-card p-3 transition-all hover:border-muted-foreground/30 ${table.enabled ? "" : "opacity-70"}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                        #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${table.enabled ? "bg-success" : "bg-muted-foreground/40"}`}
                          title={table.enabled ? "Enabled" : "Disabled"}
                        />
                        <button
                          type="button"
                          onClick={() => removeDiningTable(idx)}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                          title="Remove table"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-muted/40">
                      <Icon name="table" size={28} className="text-muted-foreground/50" />
                    </div>
                    <Input
                      value={table.label ?? ""}
                      onChange={(e) => updateDiningTable(idx, "label", e.target.value)}
                      placeholder="Table label"
                      className="h-9 w-full text-sm"
                    />
                    {tableError && <p className="mt-1.5 text-xs text-destructive">{tableError}</p>}
                    <button
                      type="button"
                      onClick={() => updateDiningTable(idx, "enabled", !table.enabled)}
                      className={`mt-2 w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        table.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {table.enabled ? "On" : "Off"}
                    </button>
                  </div>
                );
              })}
              {/* Add card — dashed tile at the end, like Products' add flow */}
              <button
                type="button"
                onClick={addDiningTable}
                className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon name="plus" size={18} />
                </span>
                <span className="text-sm font-medium">Add table</span>
                <span className="text-xs opacity-70">Table {diningRows.length + 1}</span>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {diningRows.length} table{diningRows.length !== 1 ? "s" : ""} configured
              </p>
              <button
                type="button"
                onClick={toggleTakeout}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  diningTables.takeoutEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {diningTables.takeoutEnabled ? "Takeout: On" : "Takeout: Off"}
              </button>
            </div>
            <div className="mt-3 flex justify-end"><SectionSaveButton sectionKey="tables" /></div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Restrict staff email login to specific IP addresses (store devices only).</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Allowed IP Addresses</label>
              <Textarea placeholder={"192.168.1.100, 192.168.1.101, 10.0.0.1"} rows={3}
                error={errors.storeIpWhitelist?.message} {...register("storeIpWhitelist")} />
              <p className="mt-1.5 text-xs text-muted-foreground">Comma-separated IP addresses. Leave empty to allow all IPs.</p>
            </div>
            <div className="mt-3 flex justify-end"><SectionSaveButton sectionKey="security" /></div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
