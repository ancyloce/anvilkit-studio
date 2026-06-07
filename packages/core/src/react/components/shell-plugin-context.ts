/**
 * @file `createShellPluginContext` — builds the base
 * {@link StudioPluginContext} the Studio shell hands to `compilePlugins`
 * (extracted from `use-studio-controller.ts`, review finding P2-1).
 *
 * This is the immutable shell context: `getData`/`getPuckApi` read live
 * refs, `log`/`emit` route through the host logger, `t` resolves the
 * React-free config-locale catalog, and the `register*` methods proxy to
 * the per-instance sidebar registry. `compilePlugins()` re-wraps it per
 * plugin with runtime-backed `registerMessages`/`registerAssetResolver`
 * collectors; the base versions here stay inert no-ops so the shell
 * context is immutable.
 */

import type { Data as PuckData } from "@puckeditor/core";
import type { RefObject } from "react";

import { braceFormatter } from "@/i18n/format";
import { DEFAULT_MESSAGES } from "@/state/editor-i18n-context";
import type { SidebarRegistryStoreApi } from "@/state/index";
import type { StudioConfig } from "@/types/config";
import type { StudioPluginContext } from "@/types/plugin";
import type { GetPuckSnapshot } from "./studio-controller-types.js";
import { type StudioLogger, writeStudioLog } from "./studio-log.js";

/**
 * Error thrown by {@link StudioPluginContext.getPuckApi} when a plugin
 * reads the Puck API before the controller's `PuckApiBinder` binds it.
 * Exported so tests can match the exact message.
 */
export const PUCK_API_UNBOUND_MESSAGE =
	"StudioPluginContext.getPuckApi() was called before <Puck> finished mounting. " +
	"Move the call into a header action or a post-mount lifecycle hook " +
	"(`onReady`, `onDataChange`, `onBeforePublish`, `onAfterPublish`) so it runs after Puck's effect-time binder has captured the API.";

/** Live refs + per-compile config the shell context closes over. */
interface ShellPluginContextDeps {
	readonly dataRef: RefObject<PuckData>;
	readonly puckApiRef: RefObject<GetPuckSnapshot | null>;
	readonly studioConfig: StudioConfig;
	readonly sidebarRegistryStore: SidebarRegistryStoreApi;
	readonly loggerRef: RefObject<StudioLogger | undefined>;
}

/**
 * Build the base {@link StudioPluginContext} for one compile pass. A
 * fresh context (and its once-per-ctx `emit` warning latch) is created
 * on every `setup()` run, matching the prior inline literal exactly.
 */
export function createShellPluginContext({
	dataRef,
	puckApiRef,
	studioConfig,
	sidebarRegistryStore,
	loggerRef,
}: ShellPluginContextDeps): StudioPluginContext {
	// `ctx.emit` is reserved (architecture §12 / A4): warn once
	// per ctx instead of a silent no-op.
	let emitReservedWarned = false;

	return {
		getData: () => dataRef.current,
		getPuckApi: () => {
			const snapshot = puckApiRef.current;
			if (snapshot === null) {
				throw new Error(PUCK_API_UNBOUND_MESSAGE);
			}
			return snapshot() as ReturnType<StudioPluginContext["getPuckApi"]>;
		},
		studioConfig,
		log: (level, message, meta) => {
			writeStudioLog(loggerRef.current, level, message, meta);
		},
		emit: (event) => {
			// Reserved/inert until the event bus ships. Do not
			// throw, but do not stay silent: warn exactly once
			// per ctx (every environment — rate-limited, real
			// misuse) so the inert contract is discoverable.
			if (!emitReservedWarned) {
				emitReservedWarned = true;
				writeStudioLog(
					loggerRef.current,
					"warn",
					`ctx.emit("${event}") is reserved and inert: the plugin-to-plugin event bus is not implemented yet (architecture §12). No subscriber will receive this event. This warning fires once per plugin context.`,
					{ event },
				);
			}
		},
		t: (key, vars) => {
			// React-free snapshot for the config locale: core catalog
			// plus any `studioConfig.i18n.messages` overrides, brace-
			// interpolated. Plugin-registered namespaces resolve via
			// `useMsg` at render, not here.
			const { locale, messages: localeMessages } = studioConfig.i18n;
			// `DEFAULT_MESSAGES` is `satisfies`-typed (no string index
			// signature), so index through the record type for a dynamic key.
			const coreCatalog: Readonly<Record<string, string>> = DEFAULT_MESSAGES;
			const raw = localeMessages?.[locale]?.[key] ?? coreCatalog[key] ?? key;
			return braceFormatter(raw, vars ?? {}, locale);
		},
		registerMessages: () => {
			// compilePlugins() passes plugins a wrapper context with a
			// runtime-backed message collector (→ `runtime.i18n.entries`);
			// this base context's no-op keeps the shell immutable.
		},
		registerAssetResolver: () => {
			// compilePlugins() passes plugins a wrapper context
			// with a runtime-backed collector; this base context
			// stays immutable for the rest of the shell.
		},
		registerInsertSection: (section) =>
			sidebarRegistryStore.getState().registerInsertSection(section),
		registerLayerQuickAdd: (item) =>
			sidebarRegistryStore.getState().registerLayerQuickAdd(item),
		registerAssetSource: (source) =>
			sidebarRegistryStore.getState().registerAssetSource(source),
		registerAssetAction: (action) =>
			sidebarRegistryStore.getState().registerAssetAction(action),
		registerCopySnippetPack: (pack) =>
			sidebarRegistryStore.getState().registerCopySnippetPack(pack),
		registerCopilotPanel: (panel) =>
			sidebarRegistryStore.getState().registerCopilotPanel(panel),
		registerHistoryPanel: (panel) =>
			sidebarRegistryStore.getState().registerHistoryPanel(panel),
		registerDesignSystemPanel: (panel) =>
			sidebarRegistryStore.getState().registerDesignSystemPanel(panel),
	};
}
