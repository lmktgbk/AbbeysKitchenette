import { cn } from "@/lib/utils";

/**
 * LoadMore — "Load More" button for progressive list rendering.
 *
 * Shows how many items remain and loads more on click.
 * Used when lists could grow large (e.g., 100+ batches).
 *
 * @param {Object} props
 * @param {number} props.loaded - Number of items currently shown
 * @param {number} props.total - Total number of items
 * @param {number} [props.chunkSize=20] - Items to load per click
 * @param {() => void} props.onLoadMore - Callback to load more items
 * @param {string} [props.className] - Additional classes
 * @param {string} [props.itemLabel="items"] - Label for the item type
 */
export function LoadMore({
    loaded,
    total,
    chunkSize = 20,
    onLoadMore,
    className,
    itemLabel = "items",
}) {
    const remaining = total - loaded;

    if (remaining <= 0) return null;

    return (
        <button
            onClick={onLoadMore}
            className={cn(
                "w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border-t border-border",
                className,
            )}
        >
            Load more ({Math.min(chunkSize, remaining)} of {remaining} {itemLabel})
        </button>
    );
}
