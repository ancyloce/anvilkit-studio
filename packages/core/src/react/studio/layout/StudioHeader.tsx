/**
 * @file Studio header bar — brand mark, breadcrumb, Share / Preview /
 * Publish actions, plus the `<HeaderActions>` slot.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { ChevronLeft, ChevronRight, Play, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useStudioPluginContextOrNull } from "@/context/plugin-context";
import { useStudioRuntime } from "@/hooks/use-studio";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { StudioPluginMeta } from "@/types/plugin";
import { HeaderActions } from "./HeaderActions";
import { PublishPanel } from "./PublishPanel";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly lastSavedAt?: Date | null;
}

export function StudioHeader({
	onBack,
	lastSavedAt = null,
}: StudioHeaderProps): ReactNode {
	const msg = useMsg();

	return (
		<header className="flex h-14 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3">
			<Button
				variant="ghost"
				size="icon"
				onClick={onBack ?? (() => window.history.back())}
				aria-label={msg("studio.back")}
			>
				<ChevronLeft />
			</Button>
			<nav
				aria-label="Breadcrumb"
				className="flex min-w-0 flex-1 items-center justify-center"
			>
				<ol className="flex items-center gap-1.5 text-sm">
					<li className="truncate text-[var(--ak-studio-muted-fg)]">
						{msg("studio.breadcrumb.project")}
					</li>
					<li aria-hidden="true" className="text-[var(--ak-studio-muted-fg)]">
						<ChevronRight className="size-3.5" />
					</li>
					<li className="truncate font-medium text-[var(--ak-studio-fg)]">
						{msg("studio.breadcrumb.file")}
					</li>
				</ol>
			</nav>
			<div className="ml-auto flex items-center gap-2">
				{lastSavedAt !== null ? (
					<span className="text-xs text-[var(--ak-studio-muted-fg)]">
						Saved {formatTimestamp(lastSavedAt)}
					</span>
				) : null}

				<Tooltip>
					<TooltipTrigger
						render={
							<Button variant="outline" size="sm" className="gap-1.5">
								<Users className="size-4" aria-hidden="true" />
								<span>{msg("studio.share")}</span>
							</Button>
						}
					/>
					<TooltipContent>{msg("studio.share")}</TooltipContent>
				</Tooltip>

				<HeaderActionsRegion />

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								aria-label={msg("studio.preview")}
							>
								<Play />
							</Button>
						}
					/>
					<TooltipContent>{msg("studio.preview")}</TooltipContent>
				</Tooltip>

				<PublishPanel />
			</div>
		</header>
	);
}

/**
 * `true` when any registered plugin self-declares the `header`
 * capability (`meta.capabilities.header === true`).
 *
 * Exported so the detection logic can be unit-tested without mounting
 * the full `<StudioHeader>` tree (which would require i18n / Puck /
 * runtime providers).
 */
export function hasHeaderActionCapability(
	plugins: readonly StudioPluginMeta[],
): boolean {
	return plugins.some((meta) => meta.capabilities?.header === true);
}

/**
 * Renders the plugin header-action surface (vertical separator +
 * `<HeaderActions>`) only when a `header`-capable plugin is configured.
 *
 * Mirrors `<HeaderActions>`'s own defensive read: outside of `<Studio>`
 * (unit tests, previews) there is no plugin context, so we render
 * nothing rather than letting the strict `useStudioRuntime()` hook
 * throw. The runtime read happens in the nested component so the hook
 * is only reached once we know a provider is present.
 */
function HeaderActionsRegion(): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		return null;
	}
	return <HeaderActionsRegionInner />;
}

function HeaderActionsRegionInner(): ReactNode {
	const runtime = useStudioRuntime();
	if (!hasHeaderActionCapability(runtime.pluginMeta)) {
		return null;
	}
	return (
		<>
			<Separator
				orientation="vertical"
				className="h-6 data-vertical:self-center"
			/>
			<HeaderActions />
		</>
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
