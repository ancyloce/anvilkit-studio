/**
 * @file Studio header bar — back, save-draft, publish, theme toggle,
 * plus the `<HeaderActions>` slot.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { ChevronLeft, Moon, Sun } from "lucide-react";
import { type ReactNode } from "react";

import { useThemeStore } from "../../stores/theme-store.js";
import { useMsg } from "../state/editor-i18n-store.js";
import { Button } from "../primitives/Button.js";
import { Separator } from "../primitives/Separator.js";
import { HeaderActions } from "./HeaderActions.js";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly onSaveDraft?: () => void | Promise<void>;
	readonly isSavingDraft?: boolean;
	readonly lastSavedAt?: Date | null;
	readonly isPublishing?: boolean;
	readonly onPublishClick?: () => void;
}

export function StudioHeader({
	onBack,
	onSaveDraft,
	isSavingDraft = false,
	lastSavedAt = null,
	isPublishing = false,
	onPublishClick,
}: StudioHeaderProps): ReactNode {
	const msg = useMsg();
	const mode = useThemeStore((s) => s.mode);
	const setMode = useThemeStore((s) => s.setMode);

	const toggleTheme = (): void => {
		setMode(mode === "dark" ? "light" : "dark");
	};

	return (
		<header className="flex h-12 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-bg)] px-3">
			{onBack !== undefined ? (
				<Button variant="ghost" size="icon" onClick={onBack}>
					<ChevronLeft />
					<span className="sr-only">{msg("studio.back")}</span>
				</Button>
			) : null}
			<Separator orientation="vertical" className="h-6" />
			<div className="flex items-center gap-1 text-sm font-medium">
				<span>AnvilKit Studio</span>
			</div>

			<div className="ml-auto flex items-center gap-2">
				{lastSavedAt !== null ? (
					<span className="text-xs text-[var(--ak-studio-muted-fg)]">
						Saved {formatTimestamp(lastSavedAt)}
					</span>
				) : null}
				<HeaderActions />
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleTheme}
					aria-label={mode === "dark" ? msg("studio.theme.light") : msg("studio.theme.dark")}
				>
					{mode === "dark" ? <Sun /> : <Moon />}
				</Button>
				{onSaveDraft !== undefined ? (
					<Button
						variant="outline"
						onClick={() => {
							void onSaveDraft();
						}}
						disabled={isSavingDraft}
					>
						{msg("studio.saveDraft")}
					</Button>
				) : null}
				<Button
					variant="default"
					onClick={onPublishClick}
					disabled={isPublishing}
				>
					{isPublishing ? msg("studio.publishing") : msg("studio.publish")}
				</Button>
			</div>
		</header>
	);
}

function formatTimestamp(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}
