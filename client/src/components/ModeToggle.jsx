import useThemeStore from "@/features/theme/themeStore";
import Icon from "@/components/ui/icon";

/**
 * ModeToggle
 * Sun/moon button for toggling dark mode.
 * Used on login page and later in header.
 */
export default function ModeToggle() {
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);

    return (
        <button onClick={toggleTheme} className="mode-toggle" aria-label="Toggle theme">
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </button>
    );
}
