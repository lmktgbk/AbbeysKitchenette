import { useState, useMemo } from "react";
import { usePopularity } from "../query";
import { DropDown } from "@/components/filters/DropDown";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

const TREND_CONFIG = {
  rising: { variant: "success", icon: "trendingUp" },
  stable: { variant: "outline", icon: "minus" },
  falling: { variant: "destructive", icon: "trendingDown" },
};

export default function ProductTrendsTab() {
  const [period, setPeriod] = useState("30");

  const { data, isLoading, error } = usePopularity({ period });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error) return null;

  const popularityData = data?.data;
  if (!popularityData) return null;

  const { products = [] } = popularityData;

  const chartData = useMemo(() => {
    return products.slice(0, 10).map((p) => ({
      name: p.name.length > 16 ? p.name.slice(0, 14) + "..." : p.name,
      sold: p.total_sold,
    }));
  }, [products]);

  return (
    <div className="flex flex-col gap-4">
      {/* Bar Chart */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Top 10 Products by Sales Volume</h3>
          <DropDown
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            size="sm"
          />
        </div>
        <div className="p-4">
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No sales data available for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [`${value} units`, "Sold"]}
                />
                <Bar
                  dataKey="sold"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Full Ranking Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Full Product Ranking</h3>
        </div>
        {products.length === 0 ? (
          <div className="py-16 text-center">
            <Icon name="barChart2" size={48} className="mx-auto text-muted-foreground/30" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No product data available</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Daily Avg</TableHead>
                <TableHead className="text-center">Trend</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const tc = TREND_CONFIG[p.trend] || TREND_CONFIG.stable;
                return (
                  <TableRow key={p.product_id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {p.rank}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.total_sold}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {p.daily_avg}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={tc.variant}>
                        <Icon name={tc.icon} size={12} className="mr-1" />
                        {p.trend}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${
                      p.trend_pct > 0 ? "text-green-600" : p.trend_pct < 0 ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {p.trend_pct > 0 ? "+" : ""}{p.trend_pct}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
