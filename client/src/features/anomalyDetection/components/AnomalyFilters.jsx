import { DropDown } from "@/components/filters/DropDown";

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// Only the 7 active rules are listed. The server validation still accepts the
// 5 disabled categories so their historical cards remain viewable.
const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "revenue", label: "Sales" },
  { value: "cancellation", label: "Cancelled" },
  { value: "fulfillment", label: "Service" },
  { value: "refund", label: "Refunds" },
  { value: "discount", label: "Discounts" },
  { value: "cash", label: "Cash" },
  { value: "restock", label: "Restock" },
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
