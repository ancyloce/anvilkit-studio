/**
 * @file Editor selection state (PLAN-0026 §3.7.1).
 *
 * Selection is EDITOR state, never document state: it is not in `Data`,
 * not in Puck UI state, and not in history. It lives in contracts
 * because plugins and the shell both address it.
 *
 * Re-homed here by `p1-005` when the command IR moved out of the
 * published surface. `p3-007` extends it with the component-mode
 * fields (`mode`, `targetId`) and renames `scope` to `definitionScope`
 * — the current name collides in prose with component mode, which is a
 * different concept (§2 rename map).
 */

/**
 * The current selection. A selection can never span component editing
 * scopes; changing scope clears it (§10.6).
 */
export interface EditorSelectionState {
	readonly primaryId?: string;
	readonly selectedIds: readonly string[];
	readonly anchorId?: string;
	readonly scope: "page" | `component:${string}`;
}
