"use client";

import { Button } from "@anvilkit/ui/button";
import { cn } from "@anvilkit/ui/lib/utils";
import { useEffect, useState } from "react";

type DemoTheme = "dark" | "light";

const demoThemeStorageKey = "anvilkit-demo-theme";

function getPreferredTheme(): DemoTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(demoThemeStorageKey);

  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: DemoTheme) {
  const root = document.documentElement;

  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  window.localStorage.setItem(demoThemeStorageKey, theme);
}

export function DemoThemeToggle() {
  const [theme, setTheme] = useState<DemoTheme>("light");

  useEffect(() => {
    const preferredTheme = getPreferredTheme();

    setTheme(preferredTheme);
    applyTheme(preferredTheme);
  }, []);

  function handleThemeChange(nextTheme: DemoTheme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div className="flex items-center gap-1">
      {(["light", "dark"] as const).map((nextTheme) => {
        const isActive = theme === nextTheme;

        return (
          <Button
            key={nextTheme}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={isActive}
            className={cn(
              "rounded-full px-3.5 text-xs font-semibold uppercase tracking-[0.18em]",
              isActive
                ? "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => handleThemeChange(nextTheme)}
          >
            {nextTheme}
          </Button>
        );
      })}
    </div>
  );
}
