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

import type {
	StaticHeaderActionPlaceholder,
	StudioHeaderAction,
} from "@/types/plugin";
import { StudioPluginError } from "./errors.js";

// Re-export the types so consumers that import from
// `@anvilkit/core/runtime` can pull `StudioHeaderAction`,
// `StaticHeaderActionPlaceholder`, and `composeHeaderActions` from a
// single subpath.
export type {
	StaticHeaderActionPlaceholder,
	StudioHeaderAction,
} from "@/types/plugin";

/**
 * The minimal shape {@link composeHeaderActions} needs to order an
 * action: only the three sort keys. Both {@link StudioHeaderAction} (live)
 * and {@link StaticHeaderActionPlaceholder} (declared) satisfy it, so the
 * exact same ordering applies whether or not the live `onClick` /
 * `disabled` closures exist yet — that positional parity is what lets a
 * placeholder swap to its live action with no layout shift.
 */
export interface SortableHeaderAction {
	readonly id: string;
	readonly group?: StudioHeaderAction["group"];
	readonly order?: StudioHeaderAction["order"];
}

/**
 * Numeric weight assigned to each header action group, used as the
 * primary sort key inside {@link composeHeaderActions}.
 *
 * Lower number → renders earlier. The contract `primary <
 * secondary < overflow` is locked into this table; changing it is
 * the only sanctioned way to alter global header ordering.
 */
const GROUP_WEIGHT: Record<NonNullable<StudioHeaderAction["group"]>, number> = {
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
function assertUniqueIds(actions: readonly SortableHeaderAction[]): void {
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
 * Reject an action that supplies neither `labelKey` nor `label`, so the
 * shell can never render a button with no visible affordance. `labelKey`
 * (an i18n key) is preferred; `label` is the deprecated raw-string
 * fallback — exactly one must be present.
 *
 * `SortableHeaderAction` carries only the sort keys, but the real objects
 * are full {@link StudioHeaderAction}s, so the label fields are read
 * structurally.
 */
function assertHasLabel(actions: readonly SortableHeaderAction[]): void {
	for (const action of actions) {
		const labelled = action as {
			readonly labelKey?: unknown;
			readonly label?: unknown;
		};
		if (labelled.labelKey === undefined && labelled.label === undefined) {
			throw new StudioPluginError(
				action.id,
				`Header action "${action.id}" has neither "labelKey" nor "label" — one is required so the button has a visible affordance`,
			);
		}
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
	a: SortableHeaderAction,
	b: SortableHeaderAction,
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
export function composeHeaderActions<T extends SortableHeaderAction>(
	actions: readonly T[],
): T[] {
	assertUniqueIds(actions);
	assertHasLabel(actions);
	// `[...actions]` produces a fresh array so we never mutate the
	// caller's input. The spread is a single allocation — cheap
	// even for large header surfaces.
	return [...actions].sort(compareActions);
}

/**
 * One resolved toolbar slot: either a fully-loaded live action or a
 * static placeholder still awaiting its plugin's chunk.
 *
 * The discriminant lets the chrome render the two cases differently — a
 * placeholder paints disabled (no `onClick`), a live action is
 * interactive — while {@link resolveHeaderActionSlots} guarantees both
 * occupy the same `(group, order, id)`-sorted position.
 */
export type HeaderActionSlot =
	| { readonly kind: "live"; readonly action: StudioHeaderAction }
	| {
			readonly kind: "placeholder";
			readonly action: StaticHeaderActionPlaceholder;
	  };

/**
 * Coalesce declared placeholders and live header actions into one
 * ordered slot list, keyed by `id`:
 *
 * - An `id` with a **live** action renders that action (the placeholder,
 *   if any, is superseded — the chunk has landed).
 * - An `id` with **only** a placeholder renders the placeholder, disabled
 *   (its chunk is still loading, or never registered the action).
 *
 * The merged list is sorted by the shared `(group, order, id)` comparator
 * so a placeholder and its eventual live action occupy the **same**
 * position — swapping one for the other never shifts the toolbar.
 *
 * Pure + React-free: the chrome owns rendering; this only decides which
 * descriptor wins each slot and in what order. Unlike
 * {@link composeHeaderActions}, duplicate `id`s *within* either input are
 * still rejected (a plugin must not declare the same button twice), but a
 * placeholder and a live action sharing an `id` is the expected,
 * non-duplicate case.
 *
 * @param placeholders - Static declarations from
 * {@link StudioPluginMeta.staticHeaderActions} across all plugins.
 * @param live - Live actions from `register()`, after the runtime
 * concatenates every plugin's `headerActions`.
 */
export function resolveHeaderActionSlots(
	placeholders: readonly StaticHeaderActionPlaceholder[],
	live: readonly StudioHeaderAction[],
): HeaderActionSlot[] {
	assertUniqueIds(placeholders);
	assertUniqueIds(live);

	const liveIds = new Set(live.map((action) => action.id));
	const slots: HeaderActionSlot[] = [
		...live.map((action): HeaderActionSlot => ({ kind: "live", action })),
		...placeholders
			.filter((placeholder) => !liveIds.has(placeholder.id))
			.map((action): HeaderActionSlot => ({ kind: "placeholder", action })),
	];

	return slots.sort((a, b) => compareActions(a.action, b.action));
}
