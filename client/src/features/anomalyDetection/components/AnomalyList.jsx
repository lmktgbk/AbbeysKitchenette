import { Pagination } from "@/components/filters/Pagination";
import AnomalyCard from "./AnomalyCard";

const PAGE_SIZE_OPTIONS = [5, 10, 20];

export default function AnomalyList({ anomalies, totalItems, page, pageSize, onPageChange, onPageSizeChange, onAcknowledge }) {
  const totalPages = Math.ceil(totalItems / pageSize);

  if (anomalies.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {anomalies.map((anomaly) => (
        <AnomalyCard
          key={anomaly.id}
          anomaly={anomaly}
          onAcknowledge={onAcknowledge}
        />
      ))}

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={(size) => { onPageSizeChange(size); onPageChange(1); }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          itemLabel="anomalies"
        />
      )}
    </div>
  );
}
