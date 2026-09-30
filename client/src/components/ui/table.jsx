import { cn } from "@/lib/utils";

/** Table — flat-design table primitives (Table/Header/Body/Row/Head/Cell). WHY it exists: one border/hover/padding system for admin lists; consumed by ingredient batches and data tables. State: none. */

function Table({ className, noOverflow = false, ...props }) {
  return (
    <div className={cn("relative w-full", !noOverflow && "overflow-x-auto")}>
      <table
        className={cn("w-full caption-bottom text-sm min-w-[500px]", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }) {
  return (
    <thead className={cn("[&_tr]:border-b", className)} {...props} />
  );
}

function TableBody({ className, ...props }) {
  return (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        "type-small h-11 px-4 text-left align-middle font-semibold whitespace-nowrap uppercase tracking-wider text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * NumCell / MoneyCell — sanctioned numeric cells (admin).
 * Right-aligned tabular figures, font-medium (strong → semibold).
 * Replaces the medium/semibold/bold + tabular-nums scatter.
 */
function NumCell({ className, align = "right", strong = false, ...props }) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle tabular-nums",
        align === "right" && "text-right",
        align === "center" && "text-center",
        strong ? "font-semibold" : "font-medium",
        className,
      )}
      {...props}
    />
  );
}

function MoneyCell({ className, strong = false, ...props }) {
  return <NumCell align="right" strong={strong} className={className} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, NumCell, MoneyCell };
