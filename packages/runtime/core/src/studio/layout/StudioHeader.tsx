/**
 * @file Studio header bar — three quiet zones (task Phase 2): back +
 * document context (left, left-aligned) · compact save status (middle)
 * · collaboration / preview / publish (right). Brand color stays
 * restricted to `<PublishPanel>`'s single filled Publish action.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { useGetPuck } from "@puckeditor/core";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Circle,
	CircleAlert,
	Loader2,
	Maximize2,
	Minimize2,
	Play,
	Redo2,
	Settings,
	Undo2,
	Users,
} from "lucide-react";
import { memo, type ReactNode, useCallback } from "react";
import { useStudioRuntime } from "@/components/use-studio";
import { useStudioConfig } from "@/config/hooks";
import { useChromeProps } from "@/context/chrome-props";
import { useActivePage } from "@/context/pages-source";
import { useStudioPluginContextOrNull } from "@/context/plugin-context";
import { Button } from "@/primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/primitives/popover";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useFocusMode } from "@/state/slices/editor-ui-selectors";
import { formatRelativeTimestamp } from "@/utils/format-timestamp";
import { HeaderActions } from "./HeaderActions";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PublishPanel } from "./PublishPanel";
import {
	deriveSaveStatus,
	hasHeaderActionCapability,
	type SaveStatus,
	selectCollaboratorsSlot,
} from "./StudioHeader.logic";
import { ThemeToggle } from "./ThemeToggle";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly lastSavedAt?: Date | null;
	/** Mirrors `ChromeProps.isSavingDraft` — drives the save-status chip. */
	readonly isSavingDraft?: boolean;
	/** Mirrors `ChromeProps.saveError` — drives the save-status chip. */
	readonly saveError?: unknown;
	/**
	 * Host-supplied node rendered inside the compact system menu, after
	 * Theme/Locale. The seam for arbitrary host header content.
	 */
	readonly headerEnd?: ReactNode;
}

function StudioHeaderImpl({
	onBack,
	lastSavedAt = null,
	isSavingDraft = false,
	saveError = null,
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

	// Undo/redo (task Phase 3): moved out of the now-contextual canvas
	// controls and into the header's document-action cluster, next to
	// the breadcrumb they act on.
	const undo = useCallback((): void => {
		getPuck().history.back();
	}, [getPuck]);
	const redo = useCallback((): void => {
		getPuck().history.forward();
	}, [getPuck]);

	const [focusMode, setFocusMode] = useFocusMode();
	const toggleFocusMode = useCallback((): void => {
		setFocusMode(!focusMode);
	}, [focusMode, setFocusMode]);

	return (
		<header className="@container/header flex h-12 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--editor-topbar)] px-3">
			{/* Left zone: back + document context, left-aligned (not forced
			    to visual center), truncates before pushing the other zones. */}
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								onClick={handleBack}
								aria-label={msg("studio.back")}
							>
								<ChevronLeft />
							</Button>
						}
					/>
					<TooltipContent>{msg("studio.back")}</TooltipContent>
				</Tooltip>
				<nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
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

				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="inline-flex">
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={undo}
										aria-label={msg("studio.actions.undo")}
									>
										<Undo2 />
									</Button>
								</span>
							}
						/>
						<TooltipContent>{msg("studio.actions.undo")}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="inline-flex">
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={redo}
										aria-label={msg("studio.actions.redo")}
									>
										<Redo2 />
									</Button>
								</span>
							}
						/>
						<TooltipContent>{msg("studio.actions.redo")}</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Middle zone: compact save status only — the detailed relative
			    timestamp stays inside <PublishPanel> (hover this chip for the
			    same info instead of showing it twice). */}
			<div className="flex shrink-0 items-center">
				<SaveStatusChip
					isSavingDraft={isSavingDraft}
					saveError={saveError}
					lastSavedAt={lastSavedAt}
				/>
			</div>

			{/* Right zone: collaboration + preview + publish. Publish stays the
			    only persistent filled brand action. */}
			<div className="flex flex-1 items-center justify-end gap-1.5">
				<CollaboratorsSlotRegion />
				<ShareButtonRegion />
				<HeaderActionsRegion />

				<Separator
					orientation="vertical"
					className="h-5 data-vertical:self-center"
				/>
				<SystemMenuRegion headerEnd={headerEnd} />

				{/* Focus Mode: hides both side panels, keeps rail + canvas
				    controls (DESIGN.md §6). Standard ARIA toggle-button
				    pattern — one accessible name, `aria-pressed` conveys
				    state. */}
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="icon"
									onClick={toggleFocusMode}
									aria-pressed={focusMode}
									aria-label={msg("studio.actions.focusMode")}
								>
									{focusMode ? <Minimize2 /> : <Maximize2 />}
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.focusMode")}</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="sm"
								className="gap-1.5"
								onClick={handlePreview}
								disabled={onPreview === undefined}
								aria-label={msg("studio.preview")}
							>
								<Play className="size-4" aria-hidden="true" />
								<span className="hidden @xl/header:inline">
									{msg("studio.preview")}
								</span>
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
 * Compact 4-state save-status chip (task Phase 2) — replaces the old
 * always-verbose "Saved {relative}" text. `aria-live="polite"` so a
 * transition (e.g. into "Error") is announced without stealing focus,
 * matching the same convention already used for the sidebar panel's
 * title (`SidebarPanel.tsx`). Hovering the "Saved" state still surfaces
 * the relative timestamp via tooltip — the ONLY place that detail is
 * duplicated is `<PublishPanel>`, which shows it on-demand behind a click
 * rather than persistently, so this isn't the redundant-display pattern
 * the task warns against.
 */
function SaveStatusChip({
	isSavingDraft,
	saveError,
	lastSavedAt,
}: {
	readonly isSavingDraft: boolean;
	readonly saveError: unknown;
	readonly lastSavedAt: Date | null;
}): ReactNode {
	const msg = useMsg();
	const status = deriveSaveStatus({ isSavingDraft, saveError, lastSavedAt });

	const label = msg(SAVE_STATUS_MESSAGE_KEY[status]);
	const Icon = SAVE_STATUS_ICON[status];
	const chip = (
		<span
			aria-live="polite"
			className={cn(
				"inline-flex items-center gap-1 text-xs font-medium tabular-nums",
				status === "error"
					? "text-destructive"
					: "text-[var(--ak-studio-muted-fg)]",
			)}
		>
			<Icon
				className={cn(
					"size-3.5",
					status === "saving" && "animate-spin motion-reduce:animate-none",
				)}
				aria-hidden="true"
			/>
			{label}
		</span>
	);

	if (status !== "saved" || lastSavedAt === null) {
		return chip;
	}
	return (
		<Tooltip>
			<TooltipTrigger render={chip} />
			<TooltipContent>
				{msg("studio.publishPanel.savedRelative").replace(
					"{time}",
					formatRelativeTimestamp(lastSavedAt, msg),
				)}
			</TooltipContent>
		</Tooltip>
	);
}

const SAVE_STATUS_MESSAGE_KEY: Readonly<Record<SaveStatus, string>> = {
	saving: "studio.header.saveStatus.saving",
	error: "studio.header.saveStatus.error",
	saved: "studio.header.saveStatus.saved",
	unsaved: "studio.header.saveStatus.unsaved",
};

const SAVE_STATUS_ICON: Readonly<Record<SaveStatus, typeof Check>> = {
	saving: Loader2,
	error: CircleAlert,
	saved: Check,
	unsaved: Circle,
};

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
 * Renders Share only when a collaboration plugin has filled the
 * `collaborators` header slot (task Phase 2: "hide Share when no
 * functional capability exists") — Core stays decoupled from optional
 * plugins by reusing the same slot signal `<CollaboratorsSlotRegion>`
 * already reads, rather than adding a plugin-capability flag. Once
 * visible, Share still disables itself until a host wires
 * `ChromeProps.onShare` (mirrors the Preview button's
 * disabled-until-wired convention) so it's never a dead click.
 */
function ShareButtonRegion(): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		return null;
	}
	return <ShareButtonRegionInner />;
}

function ShareButtonRegionInner(): ReactNode {
	const runtime = useStudioRuntime();
	if (selectCollaboratorsSlot(runtime.slots) === null) {
		return null;
	}
	return <ShareButton />;
}

function ShareButton(): ReactNode {
	const msg = useMsg();
	const { onShare } = useChromeProps();
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={onShare}
						disabled={onShare === undefined}
						aria-label={msg("studio.share")}
					>
						<Users className="size-4" aria-hidden="true" />
						<span className="hidden @xl/header:inline">
							{msg("studio.share")}
						</span>
					</Button>
				}
			/>
			<TooltipContent>{msg("studio.share")}</TooltipContent>
		</Tooltip>
	);
}

/**
 * Compact system menu (task Phase 2: "move Theme and Locale controls
 * into a compact system or account menu") — a single `Settings` trigger
 * replaces what were 2-3 always-visible inline header buttons. Host
 * `headerEnd` renders unconditionally when supplied — same guarantee it
 * always had — only Theme/Locale are newly gated behind the trigger.
 * `<ThemeToggleRegion>` / `<LocaleSwitchRegion>` are reused UNCHANGED
 * (still independently exported + unit-tested in isolation); this only
 * changes where they're mounted, not their own gating logic.
 */
function SystemMenuRegion({
	headerEnd,
}: {
	readonly headerEnd: ReactNode;
}): ReactNode {
	const ctx = useStudioPluginContextOrNull();
	if (ctx === null) {
		if (headerEnd === null) return null;
		return <SystemMenuTrigger>{headerEnd}</SystemMenuTrigger>;
	}
	return <SystemMenuRegionInner headerEnd={headerEnd} />;
}

function SystemMenuRegionInner({
	headerEnd,
}: {
	readonly headerEnd: ReactNode;
}): ReactNode {
	const allowTheme = useStudioConfig((config) => config.theme.allowToggle);
	const showLocale = useStudioConfig((config) => config.i18n.showLocaleSwitch);
	if (!allowTheme && !showLocale && headerEnd === null) {
		return null;
	}
	return (
		<SystemMenuTrigger>
			{allowTheme || showLocale ? (
				<div className="flex items-center gap-1">
					<ThemeToggleRegion />
					<LocaleSwitchRegion />
				</div>
			) : null}
			{headerEnd}
		</SystemMenuTrigger>
	);
}

function SystemMenuTrigger({
	children,
}: {
	readonly children: ReactNode;
}): ReactNode {
	const msg = useMsg();
	const label = msg("studio.header.settings");
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-flex">
							<PopoverTrigger
								render={
									<Button variant="ghost" size="icon" aria-label={label} />
								}
							>
								<Settings className="size-4" aria-hidden="true" />
							</PopoverTrigger>
						</span>
					}
				/>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-auto min-w-36 gap-2 p-2">
				{children}
			</PopoverContent>
		</Popover>
	);
}

/**
 * Renders the built-in `<ThemeToggle>` in the system menu when
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
 * Renders the built-in `<LanguageSwitcher>` in the system menu when
 * `config.i18n.showLocaleSwitch` is on (default off, so existing mounts —
 * including hosts already rendering their own switcher via `headerEnd` —
 * see no change).
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
 * `@anvilkit/collab-ui`'s `createCollabPlugin()` fills this slot with its
 * `<PeerAvatarStack>`. Core never imports collab-ui: the avatar UI is
 * delegated through the single-occupancy slot registry.
 *
 * Renders the collaborator-avatar slot between the save-status chip
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
