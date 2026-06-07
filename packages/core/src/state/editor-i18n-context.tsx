/**
 * @file Minimal i18n stub for Studio chrome (PRD §4.1, §10).
 *
 * v1 ships English-only labels. The `EditorI18nProvider` + `useMsg()`
 * hook exist so layout components can already call
 * `useMsg("studio.publish")` today without rewiring when localization
 * lands. Plugins that need to register custom strings can do so via
 * `EditorI18nProvider`'s `messages` prop.
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
import { useOptionalLocale } from "./slices/LocaleStoreProvider";

export const DEFAULT_MESSAGES = {
	"studio.back": "Back",
	"studio.saveDraft": "Save draft",
	"studio.publish": "Publish",
	"studio.publishing": "Publishing…",
	"studio.share": "Share",
	"studio.preview": "Preview",
	"studio.brand": "AnvilKit Studio",
	"studio.breadcrumb.project": "Project",
	"studio.breadcrumb.file": "Untitled file",
	"studio.collaborators.label": "Collaborators",
	"studio.collaborators.more": "+{count}",
	"studio.theme.light": "Light theme",
	"studio.theme.dark": "Dark theme",
	"studio.theme.system": "Use system theme",
	"studio.drawer.searchPlaceholder": "Search components…",
	"studio.drawer.empty": "No components match this search.",
	"studio.outline.empty": "No components on this page yet.",
	"studio.fields.empty": "Select a component to edit its properties.",
	"studio.actions.undo": "Undo",
	"studio.actions.redo": "Redo",
	"studio.actions.zoomIn": "Zoom in",
	"studio.actions.zoomOut": "Zoom out",
	"studio.actions.viewport": "Viewport",
	"studio.actions.home": "Home",
	"studio.toolbar.viewport.mobile": "Mobile",
	"studio.toolbar.viewport.tablet": "Tablet",
	"studio.toolbar.viewport.desktop": "Desktop",
	"studio.toolbar.viewport.full": "Full width",
	"studio.headerActions.overflow": "More actions",

	// Publish panel (consolidated header entry point).
	"studio.publishPanel.trigger": "Publish",
	"studio.publishPanel.title": "Publish",
	"studio.publishPanel.savedRelative": "Saved {time}",
	"studio.publishPanel.notSaved": "No save yet",
	"studio.publishPanel.section.document": "Document",
	"studio.publishPanel.section.export": "Export",
	"studio.publishPanel.action.save": "Save draft",
	"studio.publishPanel.action.saving": "Saving…",
	"studio.publishPanel.action.publish": "Publish to live",
	"studio.publishPanel.export.empty": "No export formats registered.",
	"studio.publishPanel.export.unavailable":
		"Host has not wired an export handler.",

	// Sidebar shell (PRD §4.2).
	"studio.sidebar.close": "Close panel",

	// Module: insert (PRD §5).
	"studio.module.insert.name": "Insert",
	"studio.module.insert.search.placeholder": "Search components…",
	"studio.module.insert.section.recommended": "Recommended",
	"studio.module.insert.section.navigation": "Navigation",
	"studio.module.insert.section.top": "Top sections",
	"studio.module.insert.section.team": "Team",
	"studio.module.insert.view.grid": "Grid view",
	"studio.module.insert.view.list": "List view",
	"studio.module.insert.empty": "No components available.",
	"studio.module.insert.search.empty": "No components match your search.",

	// Module: layer (PRD §6).
	"studio.module.layer.name": "Pages & Layers",
	"studio.module.layer.pages.title": "Pages",
	"studio.module.layer.pages.add": "Add page",
	"studio.module.layer.pages.defaultTitle": "Home",
	"studio.module.layer.pages.routeBadge": "Route page",
	"studio.module.layer.pages.empty": "No pages yet.",
	"studio.module.layer.pages.error": "Could not load pages.",
	"studio.module.layer.layers.title": "Layers",
	"studio.module.layer.layers.add": "Insert layer",
	"studio.module.layer.layers.empty": "Select a page to see its layers.",
	"studio.module.layer.layers.error": "Could not load layers.",
	// Layer module — quick-add primitive labels (Phase D).
	"studio.module.layer.layers.add.layout": "Layout",
	"studio.module.layer.layers.add.row": "Row",
	"studio.module.layer.layers.add.column": "Column",
	"studio.module.layer.layers.add.text": "Text",
	// Layer module — Add Page dialog strings (Phase D).
	"studio.module.layer.pages.dialog.title": "Add page",
	"studio.module.layer.pages.dialog.field.title": "Title",
	"studio.module.layer.pages.dialog.field.path": "Path",
	"studio.module.layer.pages.dialog.field.route": "Public route",
	"studio.module.layer.pages.dialog.submit": "Create page",
	"studio.module.layer.pages.dialog.cancel": "Cancel",
	"studio.module.layer.pages.dialog.error.path":
		"Path must start with `/` for route pages.",
	// Layer module — page row actions (P2).
	"studio.module.layer.pages.menu.trigger": "Page actions",
	"studio.module.layer.pages.menu.rename": "Rename",
	"studio.module.layer.pages.menu.duplicate": "Duplicate",
	"studio.module.layer.pages.menu.settings": "Settings",
	"studio.module.layer.pages.menu.delete": "Delete",
	"studio.module.layer.pages.rename.placeholder": "Page title",
	"studio.module.layer.pages.rename.error.empty": "Title cannot be empty.",
	"studio.module.layer.pages.delete.confirm.title": "Delete page?",
	"studio.module.layer.pages.delete.confirm.body":
		"Delete “{title}”? This action cannot be undone.",
	"studio.module.layer.pages.delete.confirm.confirm": "Delete page",
	"studio.module.layer.pages.delete.confirm.cancel": "Cancel",
	// Layer module — Page Settings dialog + SEO section (P3).
	"studio.module.layer.pages.settings.title": "Page settings",
	"studio.module.layer.pages.settings.field.title": "Title",
	"studio.module.layer.pages.settings.field.path": "Path",
	"studio.module.layer.pages.settings.field.route": "Public route",
	"studio.module.layer.pages.settings.field.description": "Description",
	"studio.module.layer.pages.settings.seo.heading": "SEO",
	"studio.module.layer.pages.settings.seo.metaTitle": "Meta title",
	"studio.module.layer.pages.settings.seo.metaDescription": "Meta description",
	"studio.module.layer.pages.settings.seo.ogImage": "Open Graph image URL",
	"studio.module.layer.pages.settings.seo.noindex":
		"Discourage search engines from indexing this page",
	"studio.module.layer.pages.settings.submit": "Save changes",
	"studio.module.layer.pages.settings.cancel": "Cancel",
	"studio.module.layer.pages.settings.error.path":
		"Path must start with `/` for route pages.",
	// Layer module — Pages search (P4).
	"studio.module.layer.pages.search.placeholder": "Search pages…",
	"studio.module.layer.pages.search.empty": "No pages match your search.",
	// Layer module — Pages drag-reorder (P5).
	"studio.module.layer.pages.tree.dragHandle": "Drag to reorder page",
	"studio.module.layer.pages.tree.instructions":
		"Press space or enter to pick up a page. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel.",
	"studio.module.layer.pages.tree.announce.start": "Picked up page",
	"studio.module.layer.pages.tree.announce.moved": "Dropped page",
	"studio.module.layer.pages.tree.announce.cancelled": "Reordering cancelled.",
	// Layer module — splitter ARIA label (Phase D polish).
	"studio.module.layer.splitter.label": "Resize Pages and Layers panels",
	// Layer module — draggable layer tree (drag-and-drop reordering).
	"studio.module.layer.layers.tree.empty": "This page has no layers yet.",
	"studio.module.layer.layers.tree.dragHandle": "Drag to reorder layer",
	"studio.module.layer.layers.tree.expand": "Expand",
	"studio.module.layer.layers.tree.collapse": "Collapse",
	"studio.module.layer.layers.tree.instructions":
		"Press space or enter to pick up a layer. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel.",
	"studio.module.layer.layers.tree.announce.start": "Picked up layer",
	"studio.module.layer.layers.tree.announce.moved": "Dropped layer",
	"studio.module.layer.layers.tree.announce.cancelled": "Reordering cancelled.",

	// Module: image (PRD §7).
	"studio.module.image.name": "Assets",
	"studio.module.image.filter.all": "All",
	"studio.module.image.filter.images": "Images",
	"studio.module.image.filter.videos": "Videos",
	"studio.module.image.filter.audio": "Audio",
	"studio.module.image.upload": "Upload",
	"studio.module.image.upload.dropZone": "Drop files to upload",
	"studio.module.image.upload.progress": "Uploading…",
	"studio.module.image.upload.error": "Upload failed. Try again.",
	"studio.module.image.loadMore": "Load more",
	"studio.module.image.loading": "Loading assets…",
	"studio.module.image.loadError": "Could not load assets. Try again.",
	"studio.module.image.search.placeholder": "Search assets…",
	"studio.module.image.empty":
		"No assets yet. Upload your first asset to get started.",
	"studio.module.image.pluginMissing":
		"Install @anvilkit/plugin-asset-manager to manage assets.",
	"studio.module.image.actions.add": "Add",
	"studio.module.image.actions.more": "More actions",
	"studio.module.image.actions.rename": "Rename",
	"studio.module.image.actions.replace": "Replace",
	"studio.module.image.actions.copyUrl": "Copy URL",
	"studio.module.image.actions.delete": "Delete",
	"studio.module.image.requireTarget":
		"Drop the asset onto an image element on the canvas to replace it.",
	"studio.module.image.folder.root": "All assets",
	"studio.module.image.folder.nav": "Folders",
	"studio.module.image.folder.new": "New folder",
	"studio.module.image.folder.newPrompt": "Folder name",
	"studio.module.image.folder.empty": "This folder is empty.",
	"studio.module.image.source.all": "All",
	"studio.module.image.source.library": "Library",
	"studio.module.image.source.unsplash": "Unsplash",
	"studio.module.image.theme.label": "Themes",

	// Module: text (PRD §8).
	"studio.module.text.name": "Copywriting",
	"studio.module.text.filter.all": "All",
	"studio.module.text.filter.basic": "Basic",
	"studio.module.text.filter.brand": "Brand",
	"studio.module.text.category.basic": "Basic copy",
	"studio.module.text.category.brand": "Brand copy",
	"studio.module.text.search.placeholder": "Search copy…",
	"studio.module.text.empty": "No copy snippets available.",
	"studio.module.text.requireSelection":
		"Select a text element on the canvas to insert copy.",
	"studio.module.text.requireTarget":
		"Drop the snippet onto a text element on the canvas to replace it.",

	// Module: copilot (AI Copilot — host-supplied panel).
	"studio.module.copilot.name": "AI Copilot",
	"studio.module.copilot.empty":
		"Install @anvilkit/plugin-ai-copilot and register a copilot panel to enable AI generation.",

	// Module: history (Version History — host-supplied panel).
	"studio.module.history.name": "History",
	"studio.module.history.empty":
		"Install @anvilkit/plugin-version-history and register a history panel to view snapshots.",

	// Module: design-system (Design System — host-supplied panel).
	"studio.module.designSystem.name": "Design System",
	"studio.module.designSystem.empty":
		"Install @anvilkit/plugin-design-system and register a design-system panel to edit tokens.",

	// Field renderers (review finding N-1 — was the one systematic
	// i18n/a11y gap; these compose inside <EditorI18nProvider> but
	// previously hardcoded English user-facing + aria-label text).
	"studio.field.placeholder.select": "Select…",
	"studio.field.external.search": "Search…",
	"studio.field.external.clear": "Clear",
	"studio.field.external.loadError": "Could not load results",
	"studio.field.external.noResults": "No results",
	"studio.field.array.reorder": "Reorder",
	"studio.field.array.edit": "Edit",
	"studio.field.array.duplicate": "Duplicate",
	"studio.field.array.remove": "Remove",
	"studio.field.array.add": "Add item",

	// Relative timestamps (review finding N-c) — shared by the publish
	// panel + chrome header via `formatRelativeTimestamp`.
	"studio.time.justNow": "just now",
	"studio.time.minutesAgo": "{minutes}m ago",

	// Legacy aiHost compat adapter header action
	// (`src/compat/ai-host-adapter.ts`). Lives in `studio.*` because the
	// compat shim owns no plugin namespace of its own.
	"studio.compat.aiGenerate": "Generate with AI",
	// `satisfies` (not a `: Readonly<Record<string,string>>` annotation) so
	// `keyof typeof DEFAULT_MESSAGES` recovers the exact key union for
	// `StudioMessageKey` (the annotation would collapse it to `string`).
} satisfies Readonly<Record<string, string>>;

interface EditorI18nContextValue {
	readonly messages: Readonly<Record<string, string>>;
	readonly overrides: Readonly<Record<string, string>>;
}

const EditorI18nContext = createContext<EditorI18nContextValue | null>(null);

const EMPTY_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});

/**
 * The core registry entry: namespace `"studio"` carrying the full
 * {@link DEFAULT_MESSAGES} English catalog. `"studio"` is a reserved
 * namespace exempt from the {@link mergeCatalog} prefix guard, so every key
 * survives and the resolved catalog is byte-identical to `DEFAULT_MESSAGES`
 * when this is the only entry. Plugin namespaces (e.g. `assetManager`) own
 * their own keys and register them via `ctx.registerMessages`.
 */
const STUDIO_CORE_ENTRY: RegistryEntry = {
	namespace: "studio",
	en: DEFAULT_MESSAGES,
};

/** No plugin entries — the provider always prepends {@link STUDIO_CORE_ENTRY}. */
const EMPTY_ENTRIES: readonly RegistryEntry[] = [];

/** Empty initial lazy-pack cache. */
const EMPTY_PACKS: ReadonlyMap<string, MessageBundle> = new Map();

export interface EditorI18nProviderProps {
	readonly children: ReactNode;
	/**
	 * Per-instance overrides forwarded by `<Studio messages>`. Layered ON
	 * TOP of the resolved catalog (host always wins), preserving the legacy
	 * precedence so `useMsg`'s resolution order is unchanged.
	 */
	readonly messages?: Readonly<Record<string, string>>;
	/**
	 * **Plugin** message bundles (each plugin's slug namespace). `<Studio>`
	 * passes the compiled `runtime.i18n.entries` here; the core `studio.*`
	 * entry is prepended internally, so omit this for chrome-only resolution.
	 */
	readonly entries?: readonly RegistryEntry[];
}

export function EditorI18nProvider({
	children,
	messages,
	entries = EMPTY_ENTRIES,
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
		if (locale === "en") return;
		for (const entry of allEntries) {
			if (entry.loadMessages === undefined) continue;
			const key = loadedPackKey(entry.namespace, locale);
			if (requestedRef.current.has(key)) continue;
			requestedRef.current.add(key);
			entry
				.loadMessages(locale)
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
				.catch(() => {
					// Swallow — the namespace stays at its English baseline;
					// allow a retry on a later switch.
					requestedRef.current.delete(key);
				});
		}
	}, [allEntries, locale]);

	const value = useMemo<EditorI18nContextValue>(() => {
		const catalog = mergeCatalog(allEntries, locale, loadedPacks);
		return {
			messages: messages === undefined ? catalog : { ...catalog, ...messages },
			overrides: messages ?? EMPTY_OVERRIDES,
		};
	}, [allEntries, locale, loadedPacks, messages]);

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
	// Annotated so the `satisfies`-typed DEFAULT_MESSAGES (no string index
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
