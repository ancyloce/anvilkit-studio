/**
 * @file Studio header bar — brand mark, breadcrumb, collaborator stack,
 * Share / Preview / Publish actions, plus the `<HeaderActions>` slot.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { ChevronLeft, ChevronRight, Play, Users } from "lucide-react";
import { type ComponentType, memo, type ReactNode, useCallback } from "react";
import { useActivePage } from "@/context/pages-source";
import { useStudioPluginContextOrNull } from "@/context/plugin-context";
import { useStudioRuntime } from "@/components/use-studio";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-context";
import { formatRelativeTimestamp } from "@/utils/format-timestamp";
import type {
	StudioPluginMeta,
	StudioPluginSlotContribution,
} from "@/types/plugin";
import { HeaderActions } from "./HeaderActions";
import { PublishPanel } from "./PublishPanel";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly lastSavedAt?: Date | null;
}

function StudioHeaderImpl({
	onBack,
	lastSavedAt = null,
}: StudioHeaderProps): ReactNode {
	const msg = useMsg();
	// Stable identity for the back button so the memo boundary holds when
	// the host passes a stable `onBack` (or none); falls back to browser
	// history when unwired.
	const handleBack = useCallback(() => {
		if (onBack) {
			onBack();
			return;
		}
		window.history.back();
	}, [onBack]);
	// Reflect the host's active page in the breadcrumb's "file" position.
	// Falls back to the static `studio.breadcrumb.file` label ("Untitled
	// file") when no page source is wired or no row is marked active —
	// preserving the default for hosts that pass no `pages` prop.
	const activePage = useActivePage();
	const fileLabel =
		activePage !== null && activePage.title.length > 0
			? activePage.title
			: msg("studio.breadcrumb.file");

	return (
		<header className="flex h-14 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3">
			<Button
				variant="ghost"
				size="icon"
				onClick={handleBack}
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
					<li
						className="truncate font-medium text-[var(--ak-studio-fg)]"
						title={fileLabel}
						data-testid="ak-studio-breadcrumb-file"
					>
						{fileLabel}
					</li>
				</ol>
			</nav>
			<div className="ml-auto flex items-center gap-2">
				{lastSavedAt !== null ? (
					<span className="text-xs text-[var(--ak-studio-muted-fg)]">
						{msg("studio.publishPanel.savedRelative").replace(
							"{time}",
							formatRelativeTimestamp(lastSavedAt, msg),
						)}
					</span>
				) : null}

				<CollaboratorsSlotRegion />

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

// Memoized so a `StudioLayout` re-render doesn't re-render the header.
// `StudioLayout` passes a `useMemo`-stabilized props object, so the
// boundary actually holds across selection changes.
export const StudioHeader = memo(StudioHeaderImpl);

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

/**
 * Canonical slot id for the header collaborator-avatar anchor.
 *
 * `@anvilkit/collab-ui`'s `createCollabPlugin()` — which wraps the
 * headless `@anvilkit/plugin-collab-yjs` data plugin — fills this slot
 * with its `<PeerAvatarStack>`. Core never imports collab-ui: the
 * avatar UI is delegated entirely through the single-occupancy slot
 * registry, so the header shows nothing when no collaboration plugin is
 * configured. Mirrors the {@link StudioSlotId} `"collaborators"` literal.
 */
export const COLLABORATORS_SLOT_ID = "collaborators";

/**
 * Resolve the component a plugin contributed to the collaborators slot,
 * or `null` when the slot is unfilled.
 *
 * Exported so the slot-id contract can be unit-tested without mounting
 * the full `<StudioHeader>` tree (which would require i18n / runtime /
 * plugin-context providers).
 */
export function selectCollaboratorsSlot(
	slots: ReadonlyMap<string, StudioPluginSlotContribution>,
): ComponentType | null {
	return slots.get(COLLABORATORS_SLOT_ID)?.component ?? null;
}

/**
 * Renders the collaborator-avatar slot between the `lastSavedAt` chip
 * and the Share button.
 *
 * Mirrors `<HeaderActionsRegion>`'s defensive read: outside of
 * `<Studio>` (unit tests, previews) there is no plugin context, so we
 * render nothing rather than letting the strict `useStudioRuntime()`
 * hook throw. The runtime read happens in the nested component so the
 * hook is only reached once we know a provider is present.
 */
function CollaboratorsSlotRegion(): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		return null;
	}
	return <CollaboratorsSlotRegionInner />;
}

function CollaboratorsSlotRegionInner(): ReactNode {
	const runtime = useStudioRuntime();
	const SlotComponent = selectCollaboratorsSlot(runtime.slots);
	if (SlotComponent === null) {
		return null;
	}
	return <SlotComponent />;
}
