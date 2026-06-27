/**
 * @file Studio header bar — brand mark, breadcrumb, collaborator stack,
 * Share / Preview / Publish actions, plus the `<HeaderActions>` slot.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { useGetPuck } from "@puckeditor/core";
import { ChevronLeft, ChevronRight, Play, Users } from "lucide-react";
import { type ComponentType, memo, type ReactNode, useCallback } from "react";
import { useStudioRuntime } from "@/components/use-studio";
import { useStudioConfig } from "@/config/hooks";
import { useChromeProps } from "@/context/chrome-props";
import { useActivePage } from "@/context/pages-source";
import { useStudioPluginContextOrNull } from "@/context/plugin-context";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-context";
import type {
	StudioPluginMeta,
	StudioPluginSlotContribution,
} from "@/types/plugin";
import { formatRelativeTimestamp } from "@/utils/format-timestamp";
import { HeaderActions } from "./HeaderActions";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PublishPanel } from "./PublishPanel";
import { ThemeToggle } from "./ThemeToggle";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly lastSavedAt?: Date | null;
	/**
	 * Host-supplied node rendered in the right-hand action cluster, between
	 * the plugin header actions and the Preview button. The seam for
	 * arbitrary host header content (e.g. the `LanguageSwitcher`).
	 */
	readonly headerEnd?: ReactNode;
}

function StudioHeaderImpl({
	onBack,
	lastSavedAt = null,
	headerEnd = null,
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

	// Preview action: hand the host the LIVE editor document at click time so it
	// can open a preview of the current edits. Disabled until a host wires
	// `onPreview` (`chrome.onPreview` → ChromeProps). Mirrors the PublishPanel's
	// `getPuck().appState.data` read.
	const { onPreview } = useChromeProps();
	const getPuck = useGetPuck();
	const handlePreview = useCallback(() => {
		onPreview?.(getPuck().appState.data);
	}, [onPreview, getPuck]);

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

				<ThemeToggleRegion />

				<LocaleSwitchRegion />

				{headerEnd}

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								onClick={handlePreview}
								disabled={onPreview === undefined}
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
 * Renders the built-in `<ThemeToggle>` in the system-controls cluster
 * (between the plugin header actions and the locale switcher) when
 * `config.theme.allowToggle` is on.
 *
 * `allowToggle` has defaulted to `true` in the schema since core-011 —
 * "When `true`, the built-in theme toggle button is rendered in the
 * header" — but no renderer honored it until now, so shipping this is a
 * deliberate, announced visual addition for every anvilkit-chrome host.
 * Hosts that manage theme externally opt out with
 * `config={{ theme: { allowToggle: false } }}` (live: the controller's
 * config overlay only covers `i18n`, so a `theme` change recompiles —
 * which is fine, this is a set-once flag).
 *
 * Defensive two-level read + test-only export: same convention as
 * {@link LocaleSwitchRegion}.
 */
export function ThemeToggleRegion(): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		return null;
	}
	return <ThemeToggleRegionInner />;
}

function ThemeToggleRegionInner(): ReactNode {
	const allow = useStudioConfig((config) => config.theme.allowToggle);
	if (!allow) {
		return null;
	}
	return <ThemeToggle />;
}

/**
 * Renders the built-in `<LanguageSwitcher>` between the plugin header
 * actions and the host `headerEnd` node when
 * `config.i18n.showLocaleSwitch` is on (default off, so existing mounts —
 * including hosts already rendering their own switcher via `headerEnd` —
 * see no change). System chrome groups with the plugin/system actions;
 * `headerEnd` keeps its documented position as the *last* host slot, so a
 * host's own switcher would sit visibly adjacent during migration.
 *
 * Reads the **live** config (the controller overlays the host's latest raw
 * `i18n` block), so flipping the flag at runtime shows/hides the switcher
 * without a plugin recompile.
 *
 * Mirrors `<HeaderActionsRegion>`'s defensive two-level read: outside of
 * `<Studio>` (unit tests, previews) there is no plugin context — and no
 * config provider — so we render nothing rather than letting the strict
 * `useStudioConfig()` hook throw.
 *
 * Exported so the config-flag gate can be unit-tested without mounting
 * the full `<StudioHeader>` tree (which would require chrome-props /
 * export-store / pages providers for `<PublishPanel>` et al.) — same
 * convention as {@link hasHeaderActionCapability} and
 * {@link selectCollaboratorsSlot}.
 */
export function LocaleSwitchRegion(): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		return null;
	}
	return <LocaleSwitchRegionInner />;
}

function LocaleSwitchRegionInner(): ReactNode {
	const show = useStudioConfig((config) => config.i18n.showLocaleSwitch);
	if (!show) {
		return null;
	}
	return <LanguageSwitcher />;
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
