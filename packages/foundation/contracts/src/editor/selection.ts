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
	/**
	 * Which component **definition** is being edited, or the page.
	 *
	 * Renamed from `scope` by `p3-007`. The rename is mandatory rather
	 * than cosmetic: this file now also carries `mode`, and "component
	 * scope" (editing a definition) and "component mode" (styling an
	 * instance's elements in place) are different concepts that would
	 * otherwise collide in every sentence written about this type.
	 */
	readonly definitionScope: "page" | `component:${string}`;
	/**
	 * The editing granularity (PLAN-0026 §3.7).
	 *
	 * `"page"` selects Puck nodes; `"component"` selects a declared
	 * style target *inside* a node. Both modes write the same carrier
	 * through the same commit helper — the mode adds **no document
	 * state at all**.
	 */
	readonly mode: "page" | "component";
	/**
	 * The active style target in component mode.
	 *
	 * Meaningful only against `primaryId`'s component type. Selecting a
	 * node whose type does not declare it **clears** it rather than
	 * carrying a dangling address — the same rule `p3-002` applies to
	 * variant selections when an axis disappears.
	 */
	readonly targetId?: string;
}
