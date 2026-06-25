"use client";

import { Button } from "@anvilkit/ui/button";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useDemoT } from "../lib/i18n/client";

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

/**
 * Single icon toggle that flips the demo between light and dark. The button
 * shows the current theme's glyph (sun in light, moon in dark) and its
 * `aria-label`/`title` name the action. Theme state lives on
 * `document.documentElement` (`.dark` + `data-theme`), the same contract the
 * root-layout bootstrap script seeds, so every shadcn-token surface — chrome
 * and marketing pages alike — flips together.
 */
export function DemoThemeToggle() {
	const t = useDemoT();
	const [theme, setTheme] = useState<DemoTheme>("light");

	useEffect(() => {
		const preferredTheme = getPreferredTheme();

		setTheme(preferredTheme);
		applyTheme(preferredTheme);
	}, []);

	const nextTheme: DemoTheme = theme === "dark" ? "light" : "dark";
	const switchLabel = t(
		nextTheme === "dark" ? "theme.toDark" : "theme.toLight",
	);

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="rounded-full text-muted-foreground hover:text-foreground"
			aria-label={switchLabel}
			title={switchLabel}
			onClick={() => {
				setTheme(nextTheme);
				applyTheme(nextTheme);
			}}
		>
			{theme === "dark" ? (
				<Moon aria-hidden="true" />
			) : (
				<Sun aria-hidden="true" />
			)}
		</Button>
	);
}
