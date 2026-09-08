import React from "react";
import useAuthStore from "@/features/auth/authStore";
import DateRangeFilter from "@/components/filters/DateRangeFilter";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardHeader({ dateFrom, dateTo, onDateChange }) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] || "Admin";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {getGreeting()}, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's an overview of your business performance.
        </p>
      </div>
      <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateChange={onDateChange} />
    </div>
  );
}

export default React.memo(DashboardHeader);
