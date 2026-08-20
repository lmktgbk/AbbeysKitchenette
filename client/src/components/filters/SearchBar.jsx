import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * SearchBar — reusable search input with icon.
 *
 * @param {Object} props
 * @param {string} props.value - Controlled value
 * @param {(value: string) => void} props.onChange - Change handler
 * @param {string} [props.placeholder='Search...'] - Placeholder text
 * @param {string} [props.className] - Additional classes
 */
export function SearchBar({ value, onChange, placeholder = "Search...", className }) {
    return (
        <div className={cn("relative", className)}>
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
    );
}
