"use client";

/**
 * @file The public `<Studio>` shell component (task `core-014`).
 *
 * `<Studio>` is a **client component** (note the `"use client"`
 * directive above). It runs hooks, effects, and dynamic chrome
 * `import()`s, so it can never be a React Server Component — the
 * directive makes that boundary explicit instead of failing at the
 * first hook on a server. Under SSR (e.g. Next App Router) a client
 * component still renders on the server, but effects do not run: the
 * controller never resolves a compiled runtime, so `<Studio>` degrades
 * to its loading skeleton on the server pass and then hydrates +
 * compiles on the client. A server render therefore produces markup
 * without throwing — locked in by `Studio.ssr.test.tsx`.
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
import {
	type ErrorInfo,
	type ReactElement,
	type ReactNode,
	useCallback,
	useMemo,
} from "react";

import type { ChromeProps } from "@/context/chrome-props";
import { StudioErrorScreen } from "@/layout/StudioErrorScreen";
import { StudioLoadingScreen } from "@/layout/StudioLoadingScreen";
import { Toaster } from "@/primitives/sonner";
import { TooltipProvider } from "@/primitives/tooltip";
import {
	mergeStudioUi,
	resolveStudioViewports,
} from "@/studio/ui/merge-studio-ui";
import { useThemeSync } from "@/theme/use-theme-sync";
import { StudioEditorMount } from "../editor/StudioEditorMount.js";
import { PuckSlotProvider } from "./puck-slot-context";
import {
	composePluginProviders,
	splitOverlaysByPlacement,
} from "./Studio.composition";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { StudioProviderStack } from "./StudioProviderStack";
import { writeStudioLog } from "./studio-log";
import { useKeyEventGuard } from "./use-key-event-guard";
import { useStableEditorConfig } from "./use-shallow-stable";

import {
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
function useStudioElement<UserConfig extends PuckConfig = PuckConfig>(
	props: StudioProps<UserConfig>,
): ReactElement | null {
	const {
		puckConfig,
		ui,
		viewports,
		onBack,
		isSavingDraft,
		lastSavedAt,
		isPublishing,
		onPreview,
		onExport,
		headerEnd,
		pages,
		messages,
		loading,
		errorFallback,
		logger,
		onError,
	} = props;

	// Neutralize malformed synthetic keydown/keyup events (e.g. from password
	// managers / autofill extensions) before they reach Puck's unguarded
	// `monitorHotkeys` document listener, which would otherwise throw
	// `TypeError: e.getModifierState is not a function`.
	useKeyEventGuard();

	const {
		isAnvilkit,
		compiled,
		compileError,
		retry,
		liveStudioConfig,
		chromeAssets,
		mergedOverrides,
		puckSlot,
		puckSeedData,
		preparePuckRemount,
		handleChange,
		handlePublish,
		handlePublishClick,
		handleAction,
		handleSaveDraft,
		themeStore,
		exportStore,
		aiStore,
		editorStore,
		editorBridge,
		sidebarRegistryStore,
		resolvedStoreId,
		rootRef,
	} = useStudioController(props);
	const stableEditor = useStableEditorConfig(props.editor);

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
			// The controller wraps the host's `onPublishClick` through the shared
			// publish pipeline so the chrome's "Publish to live" emits
			// `page_published` on success (and stays `undefined`/disabled when the
			// host wired no handler). Do NOT pass the raw prop here.
			onPublishClick: handlePublishClick,
			onPreview,
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
			handlePublishClick,
			onPreview,
			onExport,
			headerEnd,
			chromeViewports,
		],
	);

	// Bind the host `logger` into a package-logger sink for the i18n
	// provider (P3: locale-pack load failures route through it, normalized;
	// `writeStudioLog` falls back to `console` when no host logger is set).
	const i18nLogger = useMemo<StudioLogger>(
		() => (level, message, meta) =>
			writeStudioLog(logger, level, message, meta),
		[logger],
	);

	// Runtime (render-time) error handling for the chrome — the complement
	// to the `compileError` branch below. A plugin overlay/provider or a
	// chrome component that throws *while rendering* is caught by
	// `<StudioErrorBoundary>` (anvilkit path) and surfaced through the same
	// `errorFallback` / `<StudioErrorScreen>` UI as a failed compile, then
	// logged. These hooks stay unconditional (declared before the loading/
	// error returns); their values are simply unused on the `null` paths.
	const handleRuntimeError = useCallback(
		(error: unknown, info: ErrorInfo): void => {
			// Log BEFORE notifying the host. `onError` is host code and the
			// boundary swallows a throwing handler (so it can't remount-loop),
			// which means notifying first would let a throwing `onError` suppress
			// our own runtime-crash record. Logging first guarantees the record
			// survives — parity with the compile-error path.
			writeStudioLog(
				logger,
				"error",
				"Studio chrome crashed while rendering.",
				{
					error,
					componentStack: info.componentStack ?? undefined,
				},
			);
			onError?.(error);
		},
		[onError, logger],
	);
	const renderRuntimeError = useCallback(
		(error: unknown, reset: () => void): ReactNode => {
			const retryRuntime = (): void => {
				preparePuckRemount();
				reset();
			};
			return errorFallback !== undefined ? (
				typeof errorFallback === "function" ? (
					errorFallback(error)
				) : (
					errorFallback
				)
			) : (
				<StudioErrorScreen error={error} onRetry={retryRuntime} />
			);
		},
		[errorFallback, preparePuckRemount],
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
	// Error state takes precedence over loading (`compiled` is `null` on a
	// failed compile too, so without this branch the editor would hang on
	// the loading fallback forever — report 0002, P1). A host `errorFallback`
	// wins; otherwise the built-in recoverable `<StudioErrorScreen>` offers a
	// Retry that forces a fresh compile via the controller's `retry()`.
	if (compileError !== null) {
		if (errorFallback !== undefined) {
			return (
				<>
					{typeof errorFallback === "function"
						? errorFallback(compileError)
						: errorFallback}
				</>
			);
		}
		return <StudioErrorScreen error={compileError} onRetry={retry} />;
	}
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
	type PuckDataFor = UserGenerics<UserConfig>["UserData"];
	// P6-01 (PLAN-0025 §8.5/§11.3): config decoration is GONE. Since
	// Phase 3 every component emits its official target attributes in
	// its own render, and v2 appearance reaches the canvas through the
	// compiled-appearance mount — the same undecorated `Config` serves
	// the editor, preview, production, and export (§1 condition 3).
	const puckElement = (
		<PuckSlotProvider value={puckSlot}>
			<Puck<UserConfig>
				config={puckConfig}
				// Puck reads `data` ONCE, in a `useState` initializer — it is an
				// initial seed, not a controlled value. Mount from the shell's
				// live document (seeded from the `data` prop, advanced by every
				// `onChange`) rather than the raw prop, so that when
				// `<StudioErrorBoundary>` catches a chrome crash and the user
				// hits Retry, `<Puck>` remounts on the work in progress instead
				// of silently reverting to the document as it was at first
				// mount (review 0036 H-5).
				data={puckSeedData as PuckDataFor}
				overrides={mergedOverrides as Partial<PuckOverrides<UserConfig>>}
				onChange={handleChange as (data: PuckDataFor) => void}
				onPublish={handlePublish as (data: PuckDataFor) => void}
				plugins={[...compiled.runtime.puckPlugins] as PuckPlugin<UserConfig>[]}
				ui={puckUi}
				onAction={handleAction}
				viewports={viewports}
			/>
		</PuckSlotProvider>
	);
	// Flag-gated lazy editor runtime (CORE-P0-012/CORE-P1A-001): the
	// mount WRAPS `<Puck>` so the editor contexts (`useStudioEditor()`,
	// `AuthoringStyleContext`) reach chrome and decorated canvas
	// renders inside Puck's subtree. Children pass through untouched —
	// and nothing is imported — unless `editor.features.enabled`.
	const editorWrappedPuck = (
		<StudioEditorMount
			editor={isAnvilkit ? stableEditor : undefined}
			bridge={editorBridge}
			editorSlot={isAnvilkit ? props.editorSlot : undefined}
		>
			{puckElement}
		</StudioEditorMount>
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
			{/* DESIGN.md §7.13: 500ms initial delay, 150ms grouping window
			    so adjacent icon tooltips (rail, action bar) open instantly
			    once the user is already "in" a hover sequence. */}
			<TooltipProvider delay={500} timeout={150}>
				<ThemeSyncBoundary />
				<Toaster position="bottom-right" closeButton />
				{viewportOverlays.map((overlay) => {
					const OverlayComponent = overlay.component;
					return <OverlayComponent key={overlay.id} />;
				})}
				{editorWrappedPuck}
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
		<StudioErrorBoundary
			onError={handleRuntimeError}
			fallback={renderRuntimeError}
		>
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
				analytics={props.analytics}
				logger={i18nLogger}
				rootRef={rootRef}
			>
				{wrappedBody}
			</StudioProviderStack>
		</StudioErrorBoundary>
	);
}

export function Studio<UserConfig extends PuckConfig = PuckConfig>(
	props: StudioProps<UserConfig>,
): ReactElement | null {
	return useStudioElement(props);
}
