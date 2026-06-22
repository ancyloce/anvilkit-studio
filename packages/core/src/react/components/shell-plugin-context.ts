/**
 * @file `createShellPluginContext` — builds the base
 * {@link StudioPluginContext} the Studio shell hands to `compilePlugins`
 * (extracted from `use-studio-controller.ts`, review finding P2-1).
 *
 * This is the immutable shell context: `getData`/`getPuckApi` read live
 * refs, `log` routes through the host logger, `emit`/`on` share one
 * per-compile event bus (architecture §8.5), `t` resolves the React-free
 * catalog for the **active** locale (live via the locale store + the
 * controller's `liveI18nRef`), and the `register*` methods proxy to the
 * per-instance sidebar registry. `compilePlugins()` re-wraps it per
 * plugin with runtime-backed `registerMessages`/`registerAssetResolver`
 * collectors; the base versions here stay inert no-ops so the shell
 * context is immutable.
 */

import type { Data as PuckData } from "@puckeditor/core";
import type { RefObject } from "react";

import { braceFormatter } from "@/i18n/format";
import { createEventBus, type EventBus } from "@/runtime/event-bus";
import { DEFAULT_MESSAGES } from "@/state/editor-i18n-context";
import type { LocaleStoreApi, SidebarRegistryStoreApi } from "@/state/index";
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
	/**
	 * The per-instance locale store — `ctx.t` reads the **active** locale
	 * via `getState()` (vanilla store, React-free) so plugin strings track
	 * runtime locale switches instead of freezing at the compile-time
	 * config value (config-centric i18n §4.6).
	 */
	readonly localeStore: LocaleStoreApi;
	/**
	 * Live `config.i18n` view maintained by the controller's overlay
	 * (`mergeLiveI18n`). `null` until the first overlay computes — `ctx.t`
	 * falls back to its compile-time `studioConfig.i18n` snapshot then
	 * (register-time calls during the first compile).
	 */
	readonly liveI18nRef: RefObject<StudioConfig["i18n"] | null>;
}

/** The base shell context plus the event bus handle backing it. */
export interface ShellPluginContextResult {
	readonly ctx: StudioPluginContext;
	/**
	 * The per-compile event bus `ctx.emit`/`ctx.on` delegate to. Returned
	 * so the controller can `clear()` it on teardown/recompile — dropping
	 * every subscription so a retained old `ctx` can't deliver to a
	 * superseded plugin set.
	 */
	readonly eventBus: EventBus;
}

/**
 * Build the base {@link StudioPluginContext} for one compile pass. A
 * fresh context (and a fresh per-compile event bus) is created on every
 * `setup()` run, so a recompile starts subscriptions from scratch and
 * never delivers to handlers from a superseded plugin set. The bus is
 * returned alongside the ctx so the controller can `clear()` it on
 * teardown.
 */
export function createShellPluginContext({
	dataRef,
	puckApiRef,
	studioConfig,
	sidebarRegistryStore,
	loggerRef,
	localeStore,
	liveI18nRef,
}: ShellPluginContextDeps): ShellPluginContextResult {
	// The plugin-to-plugin event bus (architecture §8.5). One bus per
	// compile pass, shared by every plugin's context (compilePlugins
	// spreads this base ctx, so `emit`/`on` are the same channel for all
	// plugins → cross-plugin delivery + per-`<Studio>`-instance isolation).
	// Handler failures route to the host logger via the live ref.
	const eventBus = createEventBus({
		log: (level, message, meta) => {
			writeStudioLog(loggerRef.current, level, message, meta);
		},
	});

	const ctx: StudioPluginContext = {
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
		emit: (event, payload) => eventBus.emit(event, payload),
		on: (event, handler) => eventBus.on(event, handler),
		t: (key, vars) => {
			// React-free but LIVE (config-centric i18n §4.6): the active
			// locale comes from the per-instance store (`getState()`, no
			// React), the `i18n` block from the controller's live overlay
			// (compile-time snapshot until the first overlay computes). So
			// `ctx.t` answers in the language the chrome is showing, even
			// after a recompile-free `config.i18n.*` change. It still never
			// lazy-loads non-English core packs and never resolves
			// plugin-registered namespaces — reactive, pack-aware strings
			// resolve via `useMsg`/`useT` at render.
			const locale = localeStore.getState().locale;
			const i18n = liveI18nRef.current ?? studioConfig.i18n;
			// `DEFAULT_MESSAGES` is `satisfies`-typed (no string index
			// signature), so index through the record type for a dynamic key.
			const coreCatalog: Readonly<Record<string, string>> = DEFAULT_MESSAGES;
			const raw = i18n.messages?.[locale]?.[key] ?? coreCatalog[key] ?? key;
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
		registerSeoPanel: (panel) =>
			sidebarRegistryStore.getState().registerSeoPanel(panel),
		registerPageSettingsSeoFields: (fields) =>
			sidebarRegistryStore.getState().registerPageSettingsSeoFields(fields),
	};

	return { ctx, eventBus };
}
