import useThemeStore from "@/features/theme/themeStore";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

export default function ModeToggle() {
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
        >
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </Button>
    );
}
