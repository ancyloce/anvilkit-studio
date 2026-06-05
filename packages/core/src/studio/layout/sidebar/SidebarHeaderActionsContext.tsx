/**
 * @file Bridge from active module → `SidebarPanel.actions` slot.
 *
 * Each module body may want to publish module-specific buttons into
 * the panel header (e.g., the `insert` module's grid/list view toggle
 * lives next to the `×` close per PRD §5.2). A small context owned by
 * `StudioSidebar` lets any descendant module call
 * `useSetSidebarHeaderActions(node)` from a `useEffect` to set the
 * current header-actions ReactNode; the sidebar shell reads it via
 * `useSidebarHeaderActions()` and forwards it to `<SidebarPanel actions>`.
 *
 * The context is intentionally thin — modules push, the shell reads.
 * On unmount or module switch the publishing module clears its actions
 * via the cleanup function the setter returns.
 */

import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	use,
	useEffect,
	useMemo,
	useState,
} from "react";

interface SidebarHeaderActionsContextValue {
	readonly actions: ReactNode;
	readonly setActions: Dispatch<SetStateAction<ReactNode>>;
}

const SidebarHeaderActionsContext =
	createContext<SidebarHeaderActionsContextValue | null>(null);

export interface SidebarHeaderActionsProviderProps {
	readonly children: ReactNode;
}

/**
 * Provider rendered once by `StudioSidebar` so each active module body
 * can publish header actions. Only one set of actions is visible at a
 * time — the active module owns the slot.
 */
export function SidebarHeaderActionsProvider({
	children,
}: SidebarHeaderActionsProviderProps): ReactNode {
	const [actions, setActions] = useState<ReactNode>(null);
	const value = useMemo(() => ({ actions, setActions }), [actions]);
	return (
		<SidebarHeaderActionsContext value={value}>
			{children}
		</SidebarHeaderActionsContext>
	);
}

/**
 * Read the currently-published header actions. Returns `null` outside
 * a provider so consumers can safely render in tests without the full
 * sidebar tree.
 */
export function useSidebarHeaderActions(): ReactNode {
	const ctx = use(SidebarHeaderActionsContext);
	return ctx?.actions ?? null;
}

/**
 * Publish header actions from a module body. Pass `null` to clear.
 *
 * The hook runs an effect on every render whose `actions` reference
 * changes. Modules should `useMemo` their action node so unrelated
 * re-renders do not thrash the slot. On unmount the previous module's
 * actions are cleared automatically.
 *
 * No-op outside a provider so unit tests can mount the module without
 * the full sidebar shell.
 */
export function useSetSidebarHeaderActions(actions: ReactNode): void {
	const ctx = use(SidebarHeaderActionsContext);
	useEffect(() => {
		if (ctx === null) return;
		ctx.setActions(actions);
		return () => {
			ctx.setActions(null);
		};
	}, [ctx, actions]);
}
