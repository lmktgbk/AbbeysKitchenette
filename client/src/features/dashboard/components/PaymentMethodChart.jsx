import React from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeso } from "../utils/dashboardUtils";

const PAYMENT_COLORS = {
  cash: "#22c55e",
  gcash: "#3b82f6",
  maya: "#8b5cf6",
  card: "#f59e0b",
  other: "#94a3b8",
};

const PAYMENT_LABELS = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  other: "Other",
};

function PaymentMethodChart({ data, isLoading, onDeepDive }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-4">
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="creditCard" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No payment data</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: PAYMENT_LABELS[item.method] || item.method,
    value: Number(item.amount),
    transactions: item.transactions,
  }));

  return (
    <div
      className="rounded-lg border border-border bg-card cursor-pointer hover:border-muted-foreground/30 transition-colors"
      onClick={onDeepDive}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment Methods</h3>
        {onDeepDive && <Icon name="chevronRight" size={14} className="text-muted-foreground" />}
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              nameKey="name"
              paddingAngle={2}
            >
              {chartData.map((entry, idx) => (
                <Cell
                  key={entry.name}
                  fill={Object.values(PAYMENT_COLORS)[idx % Object.values(PAYMENT_COLORS).length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatPeso(value)}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => <span className="text-xs">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Summary table */}
        <div className="mt-2 space-y-1.5">
          {data.map((item) => (
            <div key={item.method} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: PAYMENT_COLORS[item.method] || PAYMENT_COLORS.other }}
                />
                <span className="font-medium">{PAYMENT_LABELS[item.method] || item.method}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{item.transactions} txns</span>
                <span className="font-medium text-foreground">{formatPeso(item.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PaymentMethodChart);
