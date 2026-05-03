/**
 * @file Minimal i18n stub for Studio chrome (PRD §4.1).
 *
 * v1 ships English-only labels. The store + `useMsg()` hook exist so
 * layout components can already call `useMsg("studio.publish")`
 * today without rewiring when localization lands. Plugins that need
 * to register custom strings can do so via `EditorI18nStoreProvider`'s
 * `messages` prop.
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
};

interface EditorI18nContextValue {
	readonly messages: Readonly<Record<string, string>>;
}

const EditorI18nContext = createContext<EditorI18nContextValue | null>(null);

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
 * Resolve a message key to the active string. Falls back to the
 * supplied `fallback` (or the key itself) when the key is unknown,
 * so a missing translation is visible without crashing.
 */
export function useMsg(): (key: string, fallback?: string) => string {
	const ctx = useContext(EditorI18nContext);
	const messages = ctx === null ? DEFAULT_MESSAGES : ctx.messages;
	return useCallback(
		(key, fallback) => messages[key] ?? fallback ?? key,
		[messages],
	);
}
