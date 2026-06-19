/**
 * @file The public `<Studio>` shell component (task `core-014`).
 *
 * `<Studio>` is the top-level Studio entry point host apps render. It
 * wraps `@puckeditor/core`'s `<Puck>` and the AnvilKit chrome. As of
 * architecture §6 A1 it is a **thin view**: all orchestration (config
 * assembly, the async plugin-compile state machine, lifecycle wiring,
 * per-instance stores, override composition, the Puck `onChange`/
 * `onPublish` handlers) lives in {@link useStudioController}. This
 * component only selects the loading state and renders the provider
 * stack around `<Puck>`.
 *
 * The responsibilities matrix (config assembly, plugin compilation,
 * override composition, lifecycle wiring, store population, legacy
 * `aiHost` compat) is documented on `useStudioController`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-014-studio-component.md | core-014}
 */

import type { DeepPartial } from "@anvilkit/utils";
import type {
	Config as PuckConfig,
	Data as PuckData,
	OnAction as PuckOnAction,
	Overrides as PuckOverrides,
	Plugin as PuckPlugin,
	UiState as PuckUiState,
	Viewports as PuckViewports,
	UserGenerics,
} from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import { MotionConfig } from "motion/react";
import { type ReactElement, type ReactNode, useMemo } from "react";

import type { ChromeProps } from "@/context/chrome-props";
import { StudioLoadingScreen } from "@/layout/StudioLoadingScreen";
import { Toaster } from "@/primitives/sonner";
import { TooltipProvider } from "@/primitives/tooltip";
import {
	mergeStudioUi,
	resolveStudioViewports,
} from "@/studio/ui/merge-studio-ui";
import { useThemeSync } from "@/theme/use-theme-sync";
import type { StudioPluginOverlay, StudioPluginProvider } from "@/types/plugin";
import { StudioProviderStack } from "./StudioProviderStack";
import { useKeyEventGuard } from "./use-key-event-guard";

import {
	EMPTY_DATA,
	type StudioLogger,
	type StudioProps,
	useStudioController,
} from "./use-studio-controller";

// Re-exported so the public `@anvilkit/core/react` path
// (`{ Studio, StudioProps }`) and `StudioLogger` stay unchanged after
// the A1 controller extraction. `StudioProps` lives in the controller
// so the view↔controller import graph is acyclic (`check:circular`).
export type { StudioLogger, StudioProps } from "./use-studio-controller";

/**
 * Tiny hook-runner so `useThemeSync` can sit inside the provider tree
 * without `<Studio>` itself becoming a hook-only consumer of the
 * store. Returns null — this component only exists for its effect.
 */
function ThemeSyncBoundary(): null {
	useThemeSync();
	return null;
}

/**
 * Reduce a sorted array of plugin-contributed providers into a single
 * wrapped subtree. The provider at index 0 becomes the **outermost**
 * wrapper; the rightmost provider sits closest to the children.
 *
 * The caller passes providers already sorted (`compilePlugins()` sorts
 * by `(order ?? 100, registrationIndex)`). Exported so the contract is
 * unit-testable without mounting the whole shell.
 */
export function composePluginProviders(
	providers: readonly StudioPluginProvider[],
	children: ReactNode,
): ReactNode {
	return providers.reduceRight<ReactNode>((wrapped, provider) => {
		const ProviderComponent = provider.component;
		return <ProviderComponent key={provider.id}>{wrapped}</ProviderComponent>;
	}, children);
}

/**
 * Partition a flat overlay array into the three placement buckets the
 * AnvilKit chrome renders, preserving input order (already sorted by
 * `compilePlugins()`).
 */
export function splitOverlaysByPlacement(
	overlays: readonly StudioPluginOverlay[],
): {
	readonly viewport: readonly StudioPluginOverlay[];
	readonly canvas: readonly StudioPluginOverlay[];
	readonly notifications: readonly StudioPluginOverlay[];
} {
	const viewport: StudioPluginOverlay[] = [];
	const canvas: StudioPluginOverlay[] = [];
	const notifications: StudioPluginOverlay[] = [];
	for (const overlay of overlays) {
		if (overlay.placement === "viewport") viewport.push(overlay);
		else if (overlay.placement === "canvas") canvas.push(overlay);
		else if (overlay.placement === "notifications") notifications.push(overlay);
	}
	return { viewport, canvas, notifications };
}

/**
 * The public Studio shell. Thin view over {@link useStudioController}:
 * select the loading state, then render the provider stack around
 * `<Puck>`.
 *
 * @example
 * ```tsx
 * import { Studio } from "@anvilkit/core/react";
 * import { puckDemoConfig } from "./lib/puck-demo";
 * import { exportHtmlPlugin } from "@anvilkit/plugin-export-html";
 *
 * export default function EditorPage() {
 *   return (
 *     <Studio
 *       puckConfig={puckDemoConfig}
 *       plugins={[exportHtmlPlugin()]}
 *       onPublish={async (data) => {
 *         await fetch("/api/publish", {
 *           method: "POST",
 *           body: JSON.stringify(data),
 *         });
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function Studio<UserConfig extends PuckConfig = PuckConfig>(
	props: StudioProps<UserConfig>,
): ReactElement | null {
	const {
		puckConfig,
		data,
		ui,
		viewports,
		onBack,
		isSavingDraft,
		lastSavedAt,
		isPublishing,
		onPublishClick,
		onExport,
		headerEnd,
		pages,
		messages,
		loading,
	} = props;

	// Neutralize malformed synthetic keydown/keyup events (e.g. from password
	// managers / autofill extensions) before they reach Puck's unguarded
	// `monitorHotkeys` document listener, which would otherwise throw
	// `TypeError: e.getModifierState is not a function`.
	useKeyEventGuard();

	const {
		isAnvilkit,
		compiled,
		liveStudioConfig,
		chromeAssets,
		mergedOverrides,
		handleChange,
		handlePublish,
		handleAction,
		handleSaveDraft,
		themeStore,
		exportStore,
		aiStore,
		editorStore,
		sidebarRegistryStore,
		resolvedStoreId,
		rootRef,
	} = useStudioController(props);

	// RX-a: memoize the chrome viewport projection and the
	// `ChromePropsProvider` value so chrome consumers (toolbar / publish /
	// viewport) stop re-rendering on every `<Studio>` re-render. These
	// hooks run before the loading guards below to keep hook order
	// unconditional; the values are simply unused on the `null` paths.
	const puckUi = useMemo(
		() => (isAnvilkit ? mergeStudioUi(ui, viewports) : ui),
		[isAnvilkit, ui, viewports],
	);
	const chromeViewports = useMemo(
		() => (isAnvilkit ? resolveStudioViewports(puckUi, viewports) : undefined),
		[isAnvilkit, puckUi, viewports],
	);
	const chromePropsValue = useMemo<ChromeProps>(
		() => ({
			onBack,
			onSaveDraft: handleSaveDraft,
			isSavingDraft,
			lastSavedAt,
			isPublishing,
			onPublishClick,
			onExport,
			headerEnd,
			viewports: chromeViewports,
		}),
		[
			onBack,
			handleSaveDraft,
			isSavingDraft,
			lastSavedAt,
			isPublishing,
			onPublishClick,
			onExport,
			headerEnd,
			chromeViewports,
		],
	);

	// Loading state. A host-supplied `loading` node always wins. When
	// omitted, the anvilkit chrome falls back to the built-in
	// `<StudioLoadingScreen />` skeleton (skeleton rail/panel/header +
	// spinner-and-text canvas) so the pre-compile window shows the editor's
	// shape instead of a blank frame; the legacy `chrome="puck"` path keeps
	// the bare-`null` default so its output stays byte-for-byte identical to
	// pre-Phase-5 Puck.
	//
	// Note (3.4 Part 2): the real anvilkit chrome (`<StudioLayout>`)
	// mounts *inside* Puck's `puck` override slot and reads Puck state
	// via `createUsePuck()`, so it cannot render before `<Puck>` mounts —
	// and remounting `<Puck>` with a late plugin set tears it down (the
	// documented data-wipe hazard). The skeleton below is therefore a
	// standalone pre-provider view, not an early `<Puck>` render; an
	// in-Puck progressive shell is left as a browser-verified follow-up
	// (plan §7).
	//
	// Fragment-wrap the host node so any `ReactNode` satisfies the
	// component's `ReactElement | null` return without widening it.
	const loadingFallback: ReactElement | null =
		loading !== undefined ? (
			<>{loading}</>
		) : isAnvilkit ? (
			<StudioLoadingScreen />
		) : null;
	if (compiled === null) {
		return loadingFallback;
	}
	// AnvilKit chrome must wait for the dynamically-loaded preset +
	// layout before rendering, otherwise `<Puck>` would see plain Puck
	// overrides without the chrome's `puck` slot wrapping
	// `<StudioLayout>`. Hold the loading node until both state slots agree.
	if (isAnvilkit && chromeAssets === null) {
		return loadingFallback;
	}

	// React readers get the LIVE config (the compiled snapshot with the
	// host's latest raw `i18n` overlaid — see the controller's
	// `liveStudioConfig`), so `config.i18n.*` changes reach the chrome
	// without a plugin recompile. `liveStudioConfig` is null exactly when
	// `compiled` is, so this fallback is for the type system only.
	const resolvedStudioConfig = liveStudioConfig ?? compiled.studioConfig;

	// `<Puck>` infers `UserConfig` from `config={puckConfig}`. The
	// controller's runtime is deliberately non-generic, so its outputs
	// come back as the broad default; these localized casts are the
	// generic→default boundary (mirrors use-studio-controller.ts).
	// `EMPTY_DATA` is a structurally-valid empty `Data` for any config.
	type PuckDataFor = UserGenerics<UserConfig>["UserData"];
	const puckElement = (
		<Puck<UserConfig>
			config={puckConfig}
			data={data ?? (EMPTY_DATA as PuckDataFor)}
			overrides={mergedOverrides as Partial<PuckOverrides<UserConfig>>}
			onChange={handleChange as (data: PuckDataFor) => void}
			onPublish={handlePublish as (data: PuckDataFor) => void}
			plugins={[...compiled.runtime.puckPlugins] as PuckPlugin<UserConfig>[]}
			ui={puckUi}
			onAction={handleAction}
			viewports={viewports}
		/>
	);

	if (!isAnvilkit) {
		// Bit-for-bit pre-Phase-5 output: same provider stack, same JSX
		// nesting — now expressed once in `<StudioProviderStack>`. The three
		// Core-owned stores are chrome-agnostic — a host on the legacy
		// `chrome="puck"` path may still mount panels that read
		// `useExportStore` / `useAiStore` / `useThemeStore`, and each
		// `<Studio>` must stay isolated (H3).
		return (
			<StudioProviderStack
				isAnvilkit={false}
				studioConfig={resolvedStudioConfig}
				runtime={compiled.runtime}
				storeId={resolvedStoreId}
				themeStore={themeStore}
				exportStore={exportStore}
				aiStore={aiStore}
				rootRef={rootRef}
			>
				{puckElement}
			</StudioProviderStack>
		);
	}

	// AnvilKit chrome: layered providers around `<Puck>`. Order from
	// outermost to innermost — config / runtime first so descendants
	// can read them; plugin context next so chrome components see the
	// live ctx; per-instance editor stores last so the chrome reads
	// its own state slice without reaching higher.
	//
	// `<ThemeSyncBoundary />` sits inside the editor stores so its
	// effect can read the theme store but writes the resolved value
	// where every chrome surface picks it up. `chromeAssets` is held
	// only for the loading gate above — the actual `<StudioLayout>`
	// mount happens inside the `puck` slot of `studioOverrides`.
	const {
		viewport: viewportOverlays,
		canvas: canvasOverlays,
		notifications: notificationOverlays,
	} = splitOverlaysByPlacement(compiled.runtime.overlays);

	// `reducedMotion="user"` makes every framer-motion animation in the
	// AnvilKit chrome (cursor, highlight, auto-height, toggle, and the
	// animate-ui effect primitives) honor the OS "reduce motion"
	// preference — WCAG 2.3.3 (animation-from-interactions). Transform/
	// opacity tweens are auto-reduced; essential layout motion is kept.
	const studioBody = (
		<MotionConfig reducedMotion="user">
			<TooltipProvider delay={200}>
				<ThemeSyncBoundary />
				<Toaster position="bottom-right" closeButton />
				{viewportOverlays.map((overlay) => {
					const OverlayComponent = overlay.component;
					return <OverlayComponent key={overlay.id} />;
				})}
				{puckElement}
				{canvasOverlays.map((overlay) => {
					const OverlayComponent = overlay.component;
					return <OverlayComponent key={overlay.id} />;
				})}
				{notificationOverlays.map((overlay) => {
					const OverlayComponent = overlay.component;
					return <OverlayComponent key={overlay.id} />;
				})}
			</TooltipProvider>
		</MotionConfig>
	);

	// Plugin-contributed providers compose **inside** the core provider
	// stack (so each may call `useStudio()`, `useChromeProps()`,
	// `useMsg()`, etc.) and **outside** `<TooltipProvider>` + the
	// editor render. Lowest-`order` provider is outermost.
	const wrappedBody = composePluginProviders(
		compiled.runtime.providers,
		studioBody,
	);

	return (
		<StudioProviderStack
			isAnvilkit
			studioConfig={resolvedStudioConfig}
			runtime={compiled.runtime}
			ctx={compiled.ctx}
			sidebarRegistryStore={sidebarRegistryStore}
			pages={pages}
			storeId={resolvedStoreId}
			editorStore={editorStore}
			messages={messages}
			chromePropsValue={chromePropsValue}
			rootRef={rootRef}
		>
			{wrappedBody}
		</StudioProviderStack>
	);
}
