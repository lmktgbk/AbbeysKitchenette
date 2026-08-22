import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * SearchBar — reusable search input with icon and optional filter button.
 *
 * @param {Object} props
 * @param {string} props.value - Controlled value
 * @param {(value: string) => void} props.onChange - Change handler
 * @param {string} [props.placeholder='Search...'] - Placeholder text
 * @param {string} [props.className] - Additional classes
 * @param {() => void} [props.onFilterClick] - If provided, shows a filter icon button
 * @param {boolean} [props.filterActive] - Highlights the filter icon when filters are active
 */
export function SearchBar({ value, onChange, placeholder = "Search...", className, onFilterClick, filterActive = false }) {
    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <div className="relative flex-1">
                <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="pl-8 h-8 w-48 text-xs"
                />
            </div>
            {onFilterClick && (
                <button
                    onClick={onFilterClick}
                    className={`flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
                        filterActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    }`}
                    title="Sort & Filter"
                >
                    <Icon name="filter" size={14} />
                </button>
            )}
        </div>
    );
}
