import React from "react";
import DateRangeFilter from "@/components/filters/DateRangeFilter";

function DashboardHeader({ dateFrom, dateTo, onDateChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your business performance
        </p>
      </div>
      <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateChange={onDateChange} />
    </div>
  );
}

export default React.memo(DashboardHeader);
