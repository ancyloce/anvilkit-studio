"use client";

import { CodeBlock as CodeBlockPrimitive } from "@anvilkit/ui/components/animate-ui/primitives/animate/code-block";
import { cn } from "@anvilkit/ui/lib/utils";
import { useSyncExternalStore } from "react";

// Theme state lives on `document.documentElement` (`.dark` class), the
// contract `demo-theme-toggle.tsx` and the root-layout bootstrap script both
// write to — this app has no next-themes provider, so the highlighter's
// theme is read straight off that class instead of `useTheme()`.
function subscribeToThemeClass(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributeFilter: ["class"] });
	return () => observer.disconnect();
}
function getThemeSnapshot(): "dark" | "light" {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function getServerThemeSnapshot(): "dark" | "light" {
	return "light";
}

interface CodeCardProps {
	readonly code: string;
	readonly lang: string;
	readonly className?: string;
}

/**
 * Syntax-highlighted code display for the marketing "code card" snippets
 * (Steps, MiniEditor, the /hero mockup). Wraps `@anvilkit/ui`'s Shiki-backed
 * `CodeBlock` primitive rather than its `next-themes`-coupled styled wrapper
 * (this app has its own theme system — see `subscribeToThemeClass` above) —
 * same rounded-huly-cards shell the plain-text version used, so only the
 * code content itself changes.
 */
export function CodeCard({ code, lang, className }: CodeCardProps) {
	const theme = useSyncExternalStore(
		subscribeToThemeClass,
		getThemeSnapshot,
		getServerThemeSnapshot,
	);

	return (
		<CodeBlockPrimitive
			code={code}
			lang={lang}
			theme={theme}
			className={cn(
				"rounded-huly-cards border border-border bg-[color-mix(in_srgb,var(--card)_60%,var(--muted))] overflow-x-auto py-4 px-4.5 text-[12.5px] leading-[1.6]",
				"[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:font-[ui-monospace,SFMono-Regular,Menlo,monospace]",
				className,
			)}
		/>
	);
}
