import Icon from "@/components/ui/icon";

/**
 * ForecastServiceError — shown when Python forecasting service is unavailable.
 */
export default function ForecastServiceError() {
  return (
    <div className="rounded-xl border border-border bg-card py-16 text-center">
      <Icon name="cloudOff" size={48} className="mx-auto text-muted-foreground/30" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">
        Forecasting service is temporarily unavailable
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Please contact your administrator to resolve this issue.
      </p>
    </div>
  );
}
