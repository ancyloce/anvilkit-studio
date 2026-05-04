/**
 * @file Minimal i18n stub for Studio chrome (PRD §4.1, §10).
 *
 * v1 ships English-only labels. The store + `useMsg()` hook exist so
 * layout components can already call `useMsg("studio.publish")`
 * today without rewiring when localization lands. Plugins that need
 * to register custom strings can do so via `EditorI18nStoreProvider`'s
 * `messages` prop.
 *
 * ### Deprecated key aliases (PRD §10.2)
 *
 * The Phase B sidebar refactor renamed `studio.tab.insert` →
 * `studio.module.insert.name` and `studio.tab.outline` →
 * `studio.module.layer.name`. Consumers may have already overridden
 * the legacy keys via the provider's `messages` prop, so for one
 * release we keep both old keys in `DEFAULT_MESSAGES` and route an
 * override of the old key to satisfy reads of the new key when no
 * explicit override of the new key exists. Resolution order:
 *
 *   1. Catalog override of the requested key.
 *   2. Catalog override of any deprecated alias mapped to the
 *      requested key.
 *   3. Default for the requested key.
 *   4. Caller-supplied `fallback`.
 *   5. The key itself.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";

const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
	"studio.back": "Back",
	"studio.saveDraft": "Save draft",
	"studio.publish": "Publish",
	"studio.publishing": "Publishing…",
	"studio.theme.light": "Light theme",
	"studio.theme.dark": "Dark theme",
	"studio.theme.system": "Use system theme",
	"studio.tab.insert": "Insert",
	"studio.tab.outline": "Outline",
	"studio.drawer.searchPlaceholder": "Search components…",
	"studio.drawer.empty": "No components match this search.",
	"studio.outline.empty": "No components on this page yet.",
	"studio.fields.empty": "Select a component to edit its properties.",
	"studio.actions.undo": "Undo",
	"studio.actions.redo": "Redo",
	"studio.actions.zoomIn": "Zoom in",
	"studio.actions.zoomOut": "Zoom out",
	"studio.actions.viewport": "Viewport",
	"studio.headerActions.overflow": "More actions",

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
	"studio.module.layer.pages.routeBadge": "Route page",
	"studio.module.layer.pages.empty": "No pages yet.",
	"studio.module.layer.layers.title": "Layers",
	"studio.module.layer.layers.add": "Insert layer",
	"studio.module.layer.layers.empty": "Select a page to see its layers.",

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
	"studio.module.image.search.placeholder": "Search assets…",
	"studio.module.image.empty":
		"No assets yet. Upload your first asset to get started.",
	"studio.module.image.pluginMissing":
		"Install @anvilkit/plugin-asset-manager to manage assets.",
	"studio.module.image.actions.more": "More actions",
	"studio.module.image.actions.rename": "Rename",
	"studio.module.image.actions.replace": "Replace",
	"studio.module.image.actions.copyUrl": "Copy URL",
	"studio.module.image.actions.delete": "Delete",

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
};

/**
 * Maps a deprecated message key (left) to its replacement key (right).
 * When `useMsg()` is called for the *new* key but the consumer only
 * overrode the *old* key, the override is honored via this table.
 *
 * Reverse direction is automatic — `useMsg("studio.tab.insert")` falls
 * through to `studio.module.insert.name`'s default when no override is
 * present, because both keys carry the same English fallback.
 *
 * Aliased for one release; remove when downstream consumers have
 * migrated to the new keys.
 */
const DEPRECATED_KEY_ALIASES: Readonly<Record<string, string>> = {
	"studio.tab.insert": "studio.module.insert.name",
	"studio.tab.outline": "studio.module.layer.name",
};

/**
 * Inverse lookup: `new-key` → `old-key`. Built once at module load so
 * `useMsg()` resolution stays O(1) per call.
 */
const REPLACEMENT_TO_LEGACY: Readonly<Record<string, string>> =
	Object.fromEntries(
		Object.entries(DEPRECATED_KEY_ALIASES).map(([legacy, replacement]) => [
			replacement,
			legacy,
		]),
	);

interface EditorI18nContextValue {
	readonly messages: Readonly<Record<string, string>>;
	readonly overrides: Readonly<Record<string, string>>;
}

const EditorI18nContext = createContext<EditorI18nContextValue | null>(null);

const EMPTY_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});

export interface EditorI18nStoreProviderProps {
	readonly children: ReactNode;
	readonly messages?: Readonly<Record<string, string>>;
}

export function EditorI18nStoreProvider({
	children,
	messages,
}: EditorI18nStoreProviderProps): ReactNode {
	const value = useMemo<EditorI18nContextValue>(
		() => ({
			messages:
				messages === undefined
					? DEFAULT_MESSAGES
					: { ...DEFAULT_MESSAGES, ...messages },
			overrides: messages ?? EMPTY_OVERRIDES,
		}),
		[messages],
	);
	return (
		<EditorI18nContext.Provider value={value}>
			{children}
		</EditorI18nContext.Provider>
	);
}

/**
 * Resolve a message key to the active string.
 *
 * Resolution order (PRD §10.2):
 *   1. Explicit override of the requested key.
 *   2. Override of a deprecated alias mapped to the requested key
 *      (so consumers with `studio.tab.outline` overrides still see
 *      that string when callers ask for `studio.module.layer.name`).
 *   3. Default for the requested key.
 *   4. Caller-supplied `fallback`.
 *   5. The key itself, for visible-fallback debugging.
 */
export function useMsg(): (key: string, fallback?: string) => string {
	const ctx = useContext(EditorI18nContext);
	const messages = ctx === null ? DEFAULT_MESSAGES : ctx.messages;
	const overrides = ctx === null ? EMPTY_OVERRIDES : ctx.overrides;
	return useCallback(
		(key, fallback) => {
			if (key in overrides) return overrides[key] as string;
			const legacy = REPLACEMENT_TO_LEGACY[key];
			if (legacy !== undefined && legacy in overrides) {
				return overrides[legacy] as string;
			}
			return messages[key] ?? fallback ?? key;
		},
		[messages, overrides],
	);
}
