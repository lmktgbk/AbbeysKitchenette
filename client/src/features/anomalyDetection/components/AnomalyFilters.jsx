import { DropDown } from "@/components/filters/DropDown";

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "revenue", label: "Sales" },
  { value: "loss", label: "Waste" },
  { value: "cancellation", label: "Cancelled" },
  { value: "fulfillment", label: "Service" },
  { value: "refund", label: "Refunds" },
  { value: "discount", label: "Discounts" },
  { value: "cash", label: "Cash" },
  { value: "restock", label: "Restock" },
  { value: "stockout", label: "Stock" },
  { value: "supplier", label: "Supplier" },
  { value: "payment", label: "Payments" },
  { value: "sales_hours", label: "Hours" },
];

export default function AnomalyFilters({ severity, category, onSeverityChange, onCategoryChange }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <DropDown
        options={SEVERITY_OPTIONS}
        value={severity}
        onChange={onSeverityChange}
        placeholder="All Severities"
        size="sm"
        className="w-[160px] shrink-0"
      />
      <DropDown
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={onCategoryChange}
        placeholder="All Categories"
        size="sm"
        className="w-[170px] shrink-0"
      />
    </div>
  );
}
