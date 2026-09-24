import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { DropDown } from "@/components/filters/DropDown";

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100];

/** Pagination — 3-up page nav + page-size selector. WHY it exists: shared server-paging footer so lists don't reimplement windowing/counts; consumed by BatchListModal and admin tables. State: none (controlled page/size).
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

  // 3-digit page block window: Shows max 3 page numbers at a time (e.g. 1 2 3, then 4 5 6, etc.)
  const blockIndex = Math.floor((currentPage - 1) / 3);
  const startPage = blockIndex * 3 + 1;
  const endPage = Math.min(startPage + 2, totalPages);

  const pageNumbers = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  const pageSizeDropDownOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: `${size}`,
  }));

  return (
    <div
      className={cn(
        "flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-3 border-t border-border px-3 py-2 text-xs select-none",
        className
      )}
    >
      {/* Left — item count */}
      <p className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
        {totalItems === 0
          ? `No ${itemLabel}`
          : `Showing ${startItem}\u2013${endItem} of ${totalItems} ${itemLabel}`}
      </p>

      {/* Right — page size + navigation */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
        {/* Page size selector */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground hidden xs:inline">Show</span>
            <DropDown
              options={pageSizeDropDownOptions}
              value={String(pageSize)}
              onChange={(val) => onPageSizeChange(Number(val))}
              size="sm"
              className="w-14 sm:w-16 h-7 text-xs"
            />
          </div>
        )}

        {/* Page navigation (Max 3 numbers shown at a time) */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-7 w-7 p-0 shrink-0"
              aria-label="Previous page"
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
                  "h-7 min-w-[28px] px-2 text-xs font-semibold shrink-0",
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
              className="h-7 w-7 p-0 shrink-0"
              aria-label="Next page"
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
