import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../theme/theme";

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={isDark ? "切换到浅色主题" : "切换到暗色主题"}
      aria-pressed={isDark}
      onClick={onToggle}
    >
      <span aria-hidden="true" className="theme-toggle-track">
        <span className="theme-toggle-thumb">
          <Icon aria-hidden="true" size={15} />
        </span>
      </span>
      <span>{isDark ? "暗色" : "浅色"}</span>
    </button>
  );
}
