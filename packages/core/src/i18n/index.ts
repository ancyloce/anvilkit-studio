/**
 * @file Public entry for `@anvilkit/core/i18n`.
 *
 * The plugin-facing internationalization surface: the message-resolver
 * hook + provider (so plugin panels can call `useMsg()` exactly like the
 * core chrome), the registry contribution types a plugin uses to add its
 * namespaced bundles, and the formatter seam.
 *
 * Adding this subpath is an additive extension to the public Core surface
 * (P2). Typed message keys (`StudioMessageKey` / `AnvilkitMessages`) and
 * the `useT` formatter sugar are layered on by P5 — additively, so an
 * importer of this barrel never breaks.
 */

export { braceFormatter, type MessageFormatter } from "@/i18n/format";
export type {
	AnvilkitMessageKey,
	AnvilkitMessages,
	StudioMessageKey,
} from "@/i18n/keys";
export {
	type Locale,
	loadedPackKey,
	type MessageBundle,
	mergeCatalog,
	type RegistryEntry,
} from "@/i18n/registry";
export { useT } from "@/i18n/use-t";
export {
	EditorI18nProvider,
	type EditorI18nProviderProps,
	useMsg,
} from "@/state/editor-i18n-context";
// The null-tolerant active-locale read. Exposed so locale-aware integrations
// (e.g. the canvas-editor bridge in plugin-canvas-studio, which can't import
// `@anvilkit/core` and selects its prop-injected message catalog by locale)
// can react to `setLocale` exactly like `useMsg`/`useT` do internally.
export { useOptionalLocale } from "@/state/slices/LocaleStoreProvider";
