"use client";

import { useTheme } from "@/components/theme-provider";

const themeCopy = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, cycleTheme } = useTheme();

  return (
    <button className="theme-toggle" onClick={cycleTheme} type="button">
      <span className="theme-toggle-icon" aria-hidden="true">
        {resolvedTheme === "dark" ? "◐" : "◑"}
      </span>
      <span>{themeCopy[theme]}</span>
    </button>
  );
}
