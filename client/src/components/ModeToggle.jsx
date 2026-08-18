import useThemeStore from "@/features/theme/themeStore";
import Icon from "@/components/ui/icon";

export default function ModeToggle() {
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);

    return (
        <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
            <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
        </button>
    );
}
