/**
 * @file The one place the editor's test harnesses model Puck's data
 * reducer.
 *
 * ### Why this exists
 *
 * `createEditorCommandPort` dispatches two different actions, and they
 * do NOT have the same shape:
 *
 * - `execute()` commits through **`replaceRoot`**, carrying `root` —
 *   `writeAuthoringState` only ever rewrites `root.props` (the
 *   sidecar), so the whole-document action was wider than the write and
 *   tripped Puck 0.22's "`setData` is expensive and may cause
 *   unnecessary re-renders" console warning on every commit;
 * - `commitNative()` still uses **`setData`**, carrying `data`, because
 *   that path genuinely replaces the tree.
 *
 * Thirteen harnesses each open-coded `if (action.data !== undefined)`,
 * so every one of them silently swallowed `replaceRoot` — the commit
 * appeared to succeed while the store never moved. Duplicating a
 * reducer's semantics per test file is a correctness risk, not just
 * repetition, so the semantics live here once.
 */

import type { Data as PuckData } from "@puckeditor/core";

/** The subset of Puck actions the editor command port ever dispatches. */
export interface PuckDataAction {
	readonly type?: string;
	readonly recordHistory?: boolean;
	/** Present on `setData`. */
	readonly data?: PuckData;
	/** Present on `replaceRoot`. */
	readonly root?: PuckData["root"];
}

/**
 * Apply one dispatched action to `data`, exactly as Puck 0.22 would.
 *
 * `replaceRoot` mirrors Puck's `replaceRootAction`: it spread-merges
 * `root.props`, overwrites `readOnly` from the action, and leaves
 * `content`/`zones` referentially identical. The merge — rather than a
 * wholesale replace — is what preserves the sidecar VALUE reference
 * that the port's parsed-state cache keys on, so an echoed change still
 * classifies as self-originated.
 *
 * @returns the next data, or `data` unchanged for a non-data action
 *   (`setUi`, selection, …) so callers can compare by reference.
 */
export function applyPuckDataAction(
	data: PuckData,
	action: PuckDataAction,
): PuckData {
	if (action.type === "replaceRoot" && action.root !== undefined) {
		const root = action.root as {
			readonly props?: Record<string, unknown>;
			readonly readOnly?: unknown;
		};
		return {
			...data,
			root: {
				...data.root,
				props: { ...data.root?.props, ...root.props },
				readOnly: root.readOnly,
			},
		} as PuckData;
	}
	return action.data ?? data;
}
