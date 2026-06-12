/**
 * @file i18n message context for Studio chrome (PRD §4.1, §10).
 *
 * The core `studio.*` chrome catalog. English ships inline — extracted to
 * `i18n/messages/en.json` and imported as {@link DEFAULT_MESSAGES} — while the
 * other locales (zh/ja/ko) lazy-load from sibling JSON packs via the
 * {@link STUDIO_CORE_ENTRY} `loadMessages` loader, the same registry mechanism
 * every plugin uses. Layout components call `useMsg("studio.publish")` and the
 * resolved string follows the active locale (from the locale store). Plugins
 * that need to register custom strings do so via `EditorI18nProvider`'s
 * `entries` prop.
 *
 * > **Naming note (review finding Z-4, resolved):** this is a **plain
 * > React context** — it does not use Zustand `createStore`/`persist`/
 * > `useStore` like the genuine stores beside it. The message catalog is
 * > immutable per mount, so a context is the right primitive. The module
 * > and provider were renamed from `editor-i18n-store` /
 * > `EditorI18nStoreProvider` to drop the misleading `Store` naming.
 *
 * ### Message resolution
 *
 * `useMsg` resolves: catalog override → default → caller `fallback` →
 * the key itself. The Phase B `studio.tab.{insert,outline}` →
 * `studio.module.{insert,layer}.name` deprecated aliases (and their
 * legacy `DEFAULT_MESSAGES` keys) were removed in P8 after the
 * one-release migration window.
 */

import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	loadedPackKey,
	type MessageBundle,
	mergeCatalog,
	type RegistryEntry,
} from "@/i18n/registry";
// The English baseline lives at the package-root `i18n/messages/` (shipped via
// the package `files`). Imported from outside `src/` so the bundleless rslib
// build keeps the `.json` external — same pattern as every plugin's
// `i18n/entry.ts`. A JSON import preserves the literal key union, so
// `StudioMessageKey = keyof typeof DEFAULT_MESSAGES` stays exact.
import enMessages from "../../i18n/messages/en.json" with { type: "json" };
import { useOptionalLocale } from "./slices/LocaleStoreProvider";

/**
 * The core chrome English baseline (`studio.*`), sourced from
 * `i18n/messages/en.json`. `keyof typeof DEFAULT_MESSAGES` still recovers the
 * exact key union (a JSON import yields literal keys, so no `satisfies` /
 * `: Record<string, string>` annotation is needed — the latter would collapse
 * the union to `string`). Non-English locales lazy-load via
 * {@link STUDIO_CORE_ENTRY}.
 */
export const DEFAULT_MESSAGES = enMessages;

interface EditorI18nContextValue {
	readonly messages: Readonly<Record<string, string>>;
	readonly overrides: Readonly<Record<string, string>>;
}

const EditorI18nContext = createContext<EditorI18nContextValue | null>(null);

const EMPTY_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Static lazy-pack map for the core `studio.*` namespace (avoids a dynamic
 * template `import()` under rslib — each locale is an explicit entry). English
 * is the inline baseline; these resolve on demand the first time the active
 * locale switches to a non-`en` value. Mirrors every plugin's `LOCALE_PACKS`.
 */
const LOCALE_PACKS: Readonly<
	Record<string, () => Promise<{ readonly default: Record<string, string> }>>
> = {
	zh: () => import("../../i18n/messages/zh.json", { with: { type: "json" } }),
	ja: () => import("../../i18n/messages/ja.json", { with: { type: "json" } }),
	ko: () => import("../../i18n/messages/ko.json", { with: { type: "json" } }),
};

/**
 * The core registry entry: namespace `"studio"` carrying the full
 * {@link DEFAULT_MESSAGES} English catalog plus a {@link LOCALE_PACKS} lazy
 * loader for non-English locales. `"studio"` is a reserved namespace exempt
 * from the {@link mergeCatalog} prefix guard, so every key survives and the
 * resolved catalog is byte-identical to `DEFAULT_MESSAGES` when this is the
 * only entry and the locale is `en`. Plugin namespaces (e.g. `assetManager`)
 * own their own keys and register them via `ctx.registerMessages`.
 */
const STUDIO_CORE_ENTRY: RegistryEntry = {
	namespace: "studio",
	en: DEFAULT_MESSAGES,
	loadMessages: async (locale) => {
		const pack = LOCALE_PACKS[locale];
		return pack === undefined ? {} : (await pack()).default;
	},
};

/** No plugin entries — the provider always prepends {@link STUDIO_CORE_ENTRY}. */
const EMPTY_ENTRIES: readonly RegistryEntry[] = [];

/** Empty initial lazy-pack cache. */
const EMPTY_PACKS: ReadonlyMap<string, MessageBundle> = new Map();

export interface EditorI18nProviderProps {
	readonly children: ReactNode;
	/**
	 * Per-instance overrides forwarded by `<Studio messages>`. Layered ON
	 * TOP of the resolved catalog AND the {@link configMessages} overlay
	 * (the legacy host prop always wins during its migration window), so a
	 * prop-only host's `useMsg` resolution is byte-identical.
	 *
	 * @deprecated Mirror of the deprecated `<Studio messages>` prop — use
	 * {@link configMessages} (`config.i18n.messages`). Removal in 0.2.0.
	 */
	readonly messages?: Readonly<Record<string, string>>;
	/**
	 * **Plugin** message bundles (each plugin's slug namespace). `<Studio>`
	 * passes the compiled `runtime.i18n.entries` here; the core `studio.*`
	 * entry is prepended internally, so omit this for chrome-only resolution.
	 */
	readonly entries?: readonly RegistryEntry[];
	/**
	 * Per-locale chrome overrides from `config.i18n.messages`
	 * (config-centric i18n §4.4): the active locale's bundle is overlaid on
	 * the resolved catalog, back-filled by the {@link fallbackLocale}
	 * bundle. Beats the catalog (core + lazy packs + plugin entries); loses
	 * only to the deprecated flat {@link messages} prop.
	 */
	readonly configMessages?: Readonly<
		Record<string, Readonly<Record<string, string>>>
	>;
	/**
	 * `config.i18n.fallbackLocale` — the {@link configMessages} bundle used
	 * to back-fill keys missing from the active locale's bundle. No effect
	 * when it equals the active locale or has no bundle.
	 */
	readonly fallbackLocale?: string;
	/**
	 * Load every known locale pack at MOUNT instead of lazily on the first
	 * switch to that locale. `<Studio>` sets this when
	 * `config.i18n.showLocaleSwitch` is on (a visible switcher means
	 * switching is expected).
	 *
	 * This is deliberate workaround-grade eagerness: under webpack
	 * (Next 16, dev AND production builds) a locale-pack chunk requested
	 * AFTER initial page load downloads and registers but its `import()`
	 * promise never settles (`ChunkLoadError: … (timeout)`), so an
	 * at-switch load silently leaves the chrome English. Mount-time
	 * requests install reliably, so warming converts the broken path into
	 * the proven one. The at-switch load remains as the fallback for
	 * locales outside the bundled pack set.
	 */
	readonly warmLocalePacks?: boolean;
}

export function EditorI18nProvider({
	children,
	messages,
	entries = EMPTY_ENTRIES,
	configMessages,
	fallbackLocale,
	warmLocalePacks = false,
}: EditorI18nProviderProps): ReactNode {
	// Active locale, null-tolerant: resolves to "en" when no locale store is
	// mounted (RSC / tests / legacy path), mirroring `useMsg`'s fallback.
	const locale = useOptionalLocale();

	// Core `studio.*` entry first, then plugin namespaces — the catalog the
	// merge + lazy-load resolve against.
	const allEntries = useMemo<readonly RegistryEntry[]>(
		() => [STUDIO_CORE_ENTRY, ...entries],
		[entries],
	);

	// Lazy locale packs resolved so far, keyed `${namespace}:${locale}`.
	// English needs no load; non-`en` packs resolve asynchronously and a
	// successful load triggers a re-render so the catalog upgrades in place.
	const [loadedPacks, setLoadedPacks] =
		useState<ReadonlyMap<string, MessageBundle>>(EMPTY_PACKS);

	// Keys already requested (in-flight or done) so a pack is fetched at most
	// once per `(namespace, locale)`, even across the re-renders each
	// resolution triggers. A failed load is removed so a later switch retries.
	const requestedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		// English ships inline per entry; everything else resolves through
		// `loadMessages`. With `warmLocalePacks` every bundled pack locale is
		// requested up front (see the prop docs for why mount-time loading is
		// load-bearing); the active locale is always requested so switches to
		// locales outside the warm set still resolve.
		const targets = new Set<string>(
			warmLocalePacks ? Object.keys(LOCALE_PACKS) : [],
		);
		if (locale !== "en") targets.add(locale);
		for (const target of targets) {
			for (const entry of allEntries) {
				if (entry.loadMessages === undefined) continue;
				const key = loadedPackKey(entry.namespace, target);
				if (requestedRef.current.has(key)) continue;
				requestedRef.current.add(key);
				entry
					.loadMessages(target)
					.then((bundle) => {
						// Keyed by locale, so a late write is correct data even if
						// the user has since switched away — `mergeCatalog` only
						// reads the *current* locale's keys, so stale writes are
						// harmless and cached for a switch back.
						setLoadedPacks((prev) => {
							const next = new Map(prev);
							next.set(key, bundle);
							return next;
						});
					})
					.catch((error: unknown) => {
						// The namespace stays at its English baseline; dropping the
						// key allows a retry on a later switch. Surface the failure
						// instead of swallowing it: a ChunkLoadError here (e.g. a
						// stale dev-server chunk graph) otherwise reads as "locale
						// switch silently does nothing".
						console.warn(
							`[studio:i18n] failed to load locale pack "${key}" — keeping the English baseline for this namespace until the next switch`,
							error,
						);
						requestedRef.current.delete(key);
					});
			}
		}
	}, [allEntries, locale, warmLocalePacks]);

	const value = useMemo<EditorI18nContextValue>(() => {
		const catalog = mergeCatalog(allEntries, locale, loadedPacks);
		// Override precedence (lowest → highest), config-centric i18n §4.4:
		//   1. catalog — core `en` baseline + lazy packs + plugin entries
		//   2. config fallback-locale bundle (back-fill, only when distinct)
		//   3. config active-locale bundle
		//   4. deprecated flat `<Studio messages>` prop — still wins during
		//      its migration window so prop-only hosts are byte-identical.
		// The combined overlay feeds the `overrides` slot so `useMsg`'s
		// step-1 explicit-override check sees config overrides too.
		const overlay: Record<string, string> = {
			...(fallbackLocale !== undefined && fallbackLocale !== locale
				? configMessages?.[fallbackLocale]
				: undefined),
			...configMessages?.[locale],
			...messages,
		};
		const hasOverlay = Object.keys(overlay).length > 0;
		return {
			messages: hasOverlay ? { ...catalog, ...overlay } : catalog,
			overrides: hasOverlay ? overlay : EMPTY_OVERRIDES,
		};
	}, [
		allEntries,
		locale,
		loadedPacks,
		messages,
		configMessages,
		fallbackLocale,
	]);

	return <EditorI18nContext value={value}>{children}</EditorI18nContext>;
}

/**
 * Resolve a message key to the active string.
 *
 * Resolution order (PRD §10.2):
 *   1. Explicit override of the requested key.
 *   2. Default for the requested key.
 *   3. Caller-supplied `fallback`.
 *   4. The key itself, for visible-fallback debugging.
 *
 * (The deprecated-alias step was removed in P8 once downstream consumers
 * migrated to the new keys.)
 */
export function useMsg(): (key: string, fallback?: string) => string {
	const ctx = use(EditorI18nContext);
	// Annotated so the JSON-imported DEFAULT_MESSAGES (no string index
	// signature) is read through the index-signature type for `messages[key]`.
	const messages: Readonly<Record<string, string>> =
		ctx === null ? DEFAULT_MESSAGES : ctx.messages;
	const overrides = ctx === null ? EMPTY_OVERRIDES : ctx.overrides;
	return useCallback(
		(key, fallback) => {
			if (key in overrides) return overrides[key] as string;
			return messages[key] ?? fallback ?? key;
		},
		[messages, overrides],
	);
}
