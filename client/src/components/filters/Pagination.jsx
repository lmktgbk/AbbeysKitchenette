import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { DropDown } from "@/components/filters/DropDown";

const DEFAULT_PAGE_SIZE_OPTIONS = [50, 75, 100];

/**
 * Pagination — reusable page navigation with page size selector.
 *
 * @param {Object} props
 * @param {number} props.currentPage - Active page (1-indexed)
 * @param {number} props.totalItems - Total number of items
 * @param {number} [props.pageSize=20] - Items per page
 * @param {(page: number) => void} props.onPageChange
 * @param {(size: number) => void} [props.onPageSizeChange]
 * @param {number[]} [props.pageSizeOptions=[20, 50, 100]]
 * @param {string} [props.itemLabel="items"] - Label for items (e.g. "ingredients")
 * @param {string} [props.className]
 */
export function Pagination({
  currentPage,
  totalItems,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = "items",
  className,
}) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  const pageSizeDropDownOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: `${size}`,
  }));

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border px-4 py-2",
        className
      )}
    >
      {/* Left — item count */}
      <p className="text-xs text-muted-foreground">
        {totalItems === 0
          ? `No ${itemLabel}`
          : `Showing ${startItem}\u2013${endItem} of ${totalItems} ${itemLabel}`}
      </p>

      {/* Right — page size + navigation */}
      <div className="flex items-center gap-3">
        {/* Page size selector */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Show</span>
            <DropDown
              options={pageSizeDropDownOptions}
              value={String(pageSize)}
              onChange={(val) => onPageSizeChange(Number(val))}
              size="sm"
              className="w-16"
            />
          </div>
        )}

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <Icon name="chevronLeft" size={14} />
            </Button>

            {pageNumbers.map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? "primary" : "ghost"}
                size="sm"
                onClick={() => onPageChange(page)}
                className={cn(
                  "min-w-[32px]",
                  page === currentPage && "pointer-events-none"
                )}
              >
                {page}
              </Button>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
