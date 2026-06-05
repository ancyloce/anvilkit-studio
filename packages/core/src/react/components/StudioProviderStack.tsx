/**
 * @file `<StudioProviderStack>` — the composite provider wrapper for the
 * `<Studio>` shell (provider-consolidation Phases 1 & 2).
 *
 * Phase 1 extracted the two return branches of `Studio.tsx` — the legacy
 * `chrome="puck"` stack and the full `chrome="anvilkit"` stack — into this
 * one component (same DOM, same context graph).
 *
 * Phase 2 consolidates the anvilkit chrome's four hydration-gated editor
 * providers (editor-ui / theme / export / ai) into a single
 * {@link EditorStoreProvider} with one hydration gate — supplying the same
 * four contexts, so every store hook keeps its exact call shape. The legacy
 * `chrome="puck"` path keeps the explicit `Theme → Export → AI` trio
 * (bit-for-bit pre-Phase-5 output; it never mounted the editor-ui store).
 *
 * The rooted core (`StudioRootProvider` + the `ref`-bearing `div.contents`)
 * is expressed once and shared by both modes.
 *
 * @see {@link file://./Studio.tsx} for the editor-body composition
 *   (`studioBody` / `wrappedBody` / `puckElement`) passed in as `children`.
 */

import type { ReactElement, ReactNode, RefObject } from "react";
import { StudioRuntimeProvider } from "@/components/use-studio";
import { StudioConfigProvider } from "@/config/provider";
import { type ChromeProps, ChromePropsProvider } from "@/context/chrome-props";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { StudioRootProvider } from "@/context/StudioRootProvider";
import type { StudioRuntime } from "@/runtime/compile-plugins";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import type { EditorStoreBundle } from "@/state/editor-store-bundle";
import {
	type AiStoreApi,
	AiStoreProvider,
	EditorI18nProvider,
	type ExportStoreApi,
	ExportStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
	type ThemeStoreApi,
	ThemeStoreProvider,
} from "@/state/index";
import type { StudioConfig } from "@/types/config";
import type { StudioPagesSource } from "@/types/pages";
import type { StudioPluginContext } from "@/types/plugin";

/** Controller outputs shared by both chrome modes. */
interface BaseStudioProviderStackProps {
	readonly studioConfig: StudioConfig;
	readonly runtime: StudioRuntime;
	readonly storeId: string;
	readonly rootRef: RefObject<HTMLDivElement | null>;
	/**
	 * The editor body rendered at the center of the stack — `puckElement`
	 * for the legacy path, `wrappedBody` (plugin providers + Tooltip + Puck
	 * + overlays) for the anvilkit chrome.
	 */
	readonly children: ReactNode;
}

/**
 * Legacy `chrome="puck"`: config + runtime + the explicit Theme → Export →
 * AI trio only (no editor-ui store, no chrome contexts).
 */
interface PuckProviderStackProps extends BaseStudioProviderStackProps {
	readonly isAnvilkit: false;
	readonly themeStore: ThemeStoreApi;
	readonly exportStore: ExportStoreApi;
	readonly aiStore: AiStoreApi;
}

/** `chrome="anvilkit"`: the full chrome provider stack. */
interface AnvilkitProviderStackProps extends BaseStudioProviderStackProps {
	readonly isAnvilkit: true;
	readonly ctx: StudioPluginContext;
	readonly sidebarRegistryStore: SidebarRegistryStoreApi;
	readonly pages: StudioPagesSource | undefined;
	readonly messages: Readonly<Record<string, string>> | undefined;
	readonly chromePropsValue: ChromeProps;
	/** The coordinated editor-store bundle for the single `EditorStoreProvider`. */
	readonly editorStore: EditorStoreBundle;
}

export type StudioProviderStackProps =
	| PuckProviderStackProps
	| AnvilkitProviderStackProps;

/**
 * Render the AnvilKit provider stack (or the legacy puck subset) around the
 * editor body. Outermost → innermost order matches the pre-consolidation
 * `Studio.tsx` return branches; for the anvilkit chrome the
 * `editor-ui / theme / export / ai` span is now a single
 * `EditorStoreProvider` (same four contexts, one hydration gate).
 */
export function StudioProviderStack(
	props: StudioProviderStackProps,
): ReactElement {
	const { studioConfig, runtime, storeId, rootRef, children } = props;

	// `StudioRootProvider` + the instance-scoped `div.contents` — the
	// innermost core, identical in both chrome modes. Root ref scopes any
	// iframe query to this instance's subtree.
	const rooted: ReactNode = (
		<StudioRootProvider rootRef={rootRef}>
			<div ref={rootRef} className="contents">
				{children}
			</div>
		</StudioRootProvider>
	);

	if (!props.isAnvilkit) {
		const { themeStore, exportStore, aiStore } = props;
		// Bit-for-bit pre-Phase-5 legacy stack: config → runtime → the explicit
		// Theme → Export → AI trio → rooted core. The three Core-owned stores
		// are chrome-agnostic, so a host on the legacy path may still mount
		// panels that read them, and each `<Studio>` must stay isolated (H3).
		return (
			<StudioConfigProvider config={studioConfig}>
				<StudioRuntimeProvider value={runtime}>
					<ThemeStoreProvider storeId={storeId} store={themeStore}>
						<ExportStoreProvider storeId={storeId} store={exportStore}>
							<AiStoreProvider storeId={storeId} store={aiStore}>
								{rooted}
							</AiStoreProvider>
						</ExportStoreProvider>
					</ThemeStoreProvider>
				</StudioRuntimeProvider>
			</StudioConfigProvider>
		);
	}

	const {
		ctx,
		sidebarRegistryStore,
		pages,
		messages,
		chromePropsValue,
		editorStore,
	} = props;

	// AnvilKit chrome: config / runtime first so descendants can read them;
	// plugin context next so chrome components see the live ctx; the four
	// editor stores (editor-ui / theme / export / ai) are supplied together by
	// one `EditorStoreProvider` behind a single hydration gate. `i18n` +
	// `chrome-props` sit just outside the rooted core, exactly as before.
	return (
		<StudioConfigProvider config={studioConfig}>
			<StudioRuntimeProvider value={runtime}>
				<StudioPluginContextProvider value={ctx}>
					<SidebarRegistryProvider value={sidebarRegistryStore}>
						<StudioPagesSourceProvider value={pages}>
							<EditorStoreProvider storeId={storeId} store={editorStore}>
								<EditorI18nProvider messages={messages}>
									<ChromePropsProvider value={chromePropsValue}>
										{rooted}
									</ChromePropsProvider>
								</EditorI18nProvider>
							</EditorStoreProvider>
						</StudioPagesSourceProvider>
					</SidebarRegistryProvider>
				</StudioPluginContextProvider>
			</StudioRuntimeProvider>
		</StudioConfigProvider>
	);
}
