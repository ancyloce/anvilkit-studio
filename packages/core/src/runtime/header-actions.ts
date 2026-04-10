/**
 * @file Pure composition function for the header action toolbar.
 *
 * Plugins contribute {@link StudioHeaderAction} descriptors as plain
 * data through `StudioPluginRegistration.headerActions`. The Studio
 * shell (`core-014`) renders them, but the **ordering** is decided
 * here, in a side-effect-free function so it can be unit-tested
 * without React.
 *
 * ### Sort key: `(group, order, id)`
 *
 * 1. **Group precedence** — `primary < secondary < overflow`. The
 *    weights live in {@link GROUP_WEIGHT}; mutating that table is
 *    the only way to change the global ordering.
 * 2. **Order field** — within a group, ascending by `order`. Default
 *    is `100` so plugin authors can interleave between built-in
 *    round-number slots (`0`, `100`, `200`, …).
 * 3. **Id tiebreaker** — within a group/order, ascending by `id`.
 *    Because {@link composeHeaderActions} rejects duplicate ids
 *    upfront, this guarantees a fully deterministic ordering for
 *    every valid input.
 *
 * Although `Array.prototype.sort` has been **stable** since ES2019,
 * the `id` tiebreaker means stability is moot for valid inputs —
 * the comparator never returns 0 for distinct actions, and the spec
 * forbids duplicates. The stable-sort property is documented for
 * readers anyway, since it's the safety net if a future refactor
 * loosens the duplicate check.
 *
 * ### Zero React, zero Puck
 *
 * `onClick` and `disabled` on {@link StudioHeaderAction} are plain
 * TypeScript function signatures. They are *invoked* in React-land
 * by the Studio shell, but the type lives in `src/types/plugin.ts`
 * and references no React or Puck symbols. This file is fully
 * headless.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-009-runtime-export-header.md | core-009}
 */

import type { StudioHeaderAction } from "../types/plugin.js";
import { StudioPluginError } from "./errors.js";

// Re-export the type so consumers that import from
// `@anvilkit/core/runtime` can pull `StudioHeaderAction` and
// `composeHeaderActions` from a single subpath.
export type { StudioHeaderAction } from "../types/plugin.js";

/**
 * Numeric weight assigned to each header action group, used as the
 * primary sort key inside {@link composeHeaderActions}.
 *
 * Lower number → renders earlier. The contract `primary <
 * secondary < overflow` is locked into this table; changing it is
 * the only sanctioned way to alter global header ordering.
 */
const GROUP_WEIGHT: Record<
	NonNullable<StudioHeaderAction["group"]>,
	number
> = {
	primary: 0,
	secondary: 1,
	overflow: 2,
};

/**
 * Default group used when an action omits the optional `group`
 * field. `secondary` is the middle bucket and the natural home for
 * "everyday" actions a plugin author might not have explicitly
 * categorized.
 */
const DEFAULT_GROUP: NonNullable<StudioHeaderAction["group"]> = "secondary";

/**
 * Default `order` applied to actions that omit the optional field.
 * Round-number convention so plugin authors can slot their actions
 * between `0`, `100`, `200`, etc.
 */
const DEFAULT_ORDER = 100;

/**
 * Detect duplicate `id`s across the entire input array and throw a
 * {@link StudioPluginError} naming the offending id.
 *
 * Hoisted so the sort path stays straight-line — once this returns
 * we can sort with confidence that every action has a unique id.
 */
function assertUniqueIds(actions: readonly StudioHeaderAction[]): void {
	const seen = new Set<string>();
	for (const action of actions) {
		if (seen.has(action.id)) {
			throw new StudioPluginError(
				action.id,
				`Duplicate header action id "${action.id}" — every action passed to composeHeaderActions must have a unique id`,
			);
		}
		seen.add(action.id);
	}
}

/**
 * Three-key comparator for the header action sort.
 *
 * Returning the raw subtraction for `order` is safe because both
 * sides are integers; for `id` we use lexicographic compare via
 * `<` / `>` rather than `localeCompare` so the result is stable
 * across locales (and slightly cheaper).
 */
function compareActions(
	a: StudioHeaderAction,
	b: StudioHeaderAction,
): number {
	const aGroup = GROUP_WEIGHT[a.group ?? DEFAULT_GROUP];
	const bGroup = GROUP_WEIGHT[b.group ?? DEFAULT_GROUP];
	if (aGroup !== bGroup) {
		return aGroup - bGroup;
	}

	const aOrder = a.order ?? DEFAULT_ORDER;
	const bOrder = b.order ?? DEFAULT_ORDER;
	if (aOrder !== bOrder) {
		return aOrder - bOrder;
	}

	if (a.id < b.id) {
		return -1;
	}
	if (a.id > b.id) {
		return 1;
	}
	return 0;
}

/**
 * Sort and validate the flat list of plugin-contributed header
 * actions into the canonical render order.
 *
 * Pure: no logging, no React, no mutation of the input array. The
 * returned array is a fresh copy so callers can mutate it freely
 * (e.g. to attach React keys at render time) without affecting any
 * other consumer.
 *
 * @param actions - Flat array of action descriptors, typically
 * built by concatenating the `headerActions` field of every
 * {@link StudioPluginRegistration} the host app loaded.
 *
 * @returns A new array sorted by `(group, order, id)`.
 *
 * @throws {@link StudioPluginError} when two actions share the same
 * `id`. The error's `pluginId` field is set to the duplicated
 * action id; `compilePlugins()` provides richer attribution at the
 * layer above when it knows which plugin contributed each action.
 */
export function composeHeaderActions(
	actions: readonly StudioHeaderAction[],
): StudioHeaderAction[] {
	assertUniqueIds(actions);
	// `[...actions]` produces a fresh array so we never mutate the
	// caller's input. The spread is a single allocation — cheap
	// even for large header surfaces.
	return [...actions].sort(compareActions);
}
