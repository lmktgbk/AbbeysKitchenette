import Icon from "@/components/ui/icon";

/**
 * ForecastServiceError
 *
 * Shown when the Python forecasting service is not running.
 */
export default function ForecastServiceError() {
  return (
    <div className="rounded-xl border border-border bg-card py-16 text-center">
      <Icon name="cloudOff" size={48} className="mx-auto text-muted-foreground/30" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">
        Forecasting service is not running
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Start it with:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          cd forecasting && python main.py
        </code>
      </p>
    </div>
  );
}
