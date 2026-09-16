import { useActiveAnomalies } from "../query";
import Icon from "@/components/ui/icon";
import { useNavigate } from "react-router-dom";

export default function DashboardAnomalyBanner() {
  const { data, isLoading } = useActiveAnomalies("critical,high");
  const navigate = useNavigate();

  const anomalies = data?.data || [];
  if (isLoading || anomalies.length === 0) return null;

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const highCount = anomalies.filter((a) => a.severity === "high").length;

  const parts = [];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (highCount > 0) parts.push(`${highCount} high`);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon name="alertTriangle" size={16} className="text-amber-500 shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-medium">{anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"} detected</span>
          {" — "}
          {parts.join(", ")}
        </p>
      </div>
      <button
        onClick={() => navigate("/anomalies")}
        className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
      >
        View Details →
      </button>
    </div>
  );
}
