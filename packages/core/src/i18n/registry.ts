/**
 * @file Per-instance i18n message registry (P0 frozen contracts §B).
 *
 * React-free **on purpose**: the runtime plugin engine
 * (`src/runtime/compile-plugins.ts`, gated by `check:react-free-runtime`)
 * imports the {@link RegistryEntry} type to collect plugin contributions,
 * so nothing here may pull in React.
 *
 * The registry holds, per `<Studio>` instance, the set of namespaced
 * message bundles (core `studio.*` first, then each plugin's slug
 * namespace). {@link mergeCatalog} flattens them into the catalog the
 * i18n provider resolves against for the active locale.
 */

/**
 * A BCP-47-ish locale tag. Open string by design (not a closed union)
 * so adding a CJK locale needs no core change. `"en"` is the canonical
 * baseline/fallback.
 */
export type Locale = string;

/** A flat `key → string` map for one namespace at one locale. */
export interface MessageBundle {
	readonly [key: string]: string;
}

/**
 * One namespace's contribution to the catalog: a static English baseline
 * shipped inline, plus an optional lazy loader for other locales.
 */
export interface RegistryEntry {
	/** Owning namespace — the plugin slug (§A); `"studio"` for core. */
	readonly namespace: string;
	/** English baseline (static). Keys must be `${namespace}.`-prefixed (core seeds excepted). */
	readonly en: MessageBundle;
	/**
	 * Lazy non-English packs. Called at most once per `(namespace, locale)`;
	 * **never** for `"en"` (the static `en` field is the baseline). A
	 * rejection leaves that namespace at its `en` strings (§B.3).
	 */
	readonly loadMessages?: (locale: Locale) => Promise<MessageBundle>;
}

/**
 * Reserved core namespaces, exempt from the prefix guard because they
 * legitimately hold the existing flat / legacy keys (`studio.*` plus the
 * transitional `assetManager.*`).
 */
const RESERVED_CORE_NAMESPACES: ReadonlySet<string> = new Set([
	"studio",
	"assetManager",
]);

/** Cache key for a resolved lazy pack: `${namespace}:${locale}`. */
export function loadedPackKey(namespace: string, locale: Locale): string {
	return `${namespace}:${locale}`;
}

/**
 * Merge registry entries into a single flat catalog for `locale`.
 *
 * Resolution (P0 §B.4):
 *   1. Entries are applied in array order; core seeds (`studio`,
 *      `assetManager`) come first so plugins cannot shadow chrome keys.
 *   2. Per entry the source bundle is `entry.en` **overlaid by** the
 *      resolved locale pack (`loaded.get(`${ns}:${locale}`)`) when present,
 *      so a *partial* pack falls back to English per missing key (and a
 *      not-yet-loaded pack shows English while it loads).
 *   3. Namespace guard: for a non-reserved namespace, a key that does not
 *      start with `${namespace}.` is dropped and reported via
 *      `onViolation` (the provider wires this to `ctx.log("warn", …)`).
 *   4. Exact-key collisions resolve last-write-wins; the guard makes
 *      cross-namespace collisions structurally impossible, so in practice
 *      only a namespace's own later pack overwrites its own keys.
 */
export function mergeCatalog(
	entries: readonly RegistryEntry[],
	locale: Locale,
	loaded: ReadonlyMap<string, MessageBundle>,
	onViolation?: (namespace: string, key: string) => void,
): MessageBundle {
	const out: Record<string, string> = {};
	for (const entry of entries) {
		const { namespace } = entry;
		const pack = loaded.get(loadedPackKey(namespace, locale));
		// English baseline overlaid by the locale pack → a partial pack
		// falls back to English per missing key (§B.4 step 2).
		const source = pack === undefined ? entry.en : { ...entry.en, ...pack };
		const reserved = RESERVED_CORE_NAMESPACES.has(namespace);
		const prefix = `${namespace}.`;
		for (const key of Object.keys(source)) {
			if (!reserved && !key.startsWith(prefix)) {
				onViolation?.(namespace, key);
				continue;
			}
			out[key] = source[key] as string;
		}
	}
	return out;
}
