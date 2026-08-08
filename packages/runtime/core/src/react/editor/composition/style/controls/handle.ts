/**
 * @file `StyleFieldHandle` — the one read/commit surface every style
 * control renders against (PLAN-0028 `p4-001`). React-free.
 *
 * Two surfaces drive the same controls and must never diverge:
 *
 * - the canonical composition Style panel, whose reads come from
 *   `document-model/read-node-field.ts` and whose writes go through
 *   `composition/use-appearance-commit.ts`;
 * - the pre-canonical inspector sections, whose reads come from the
 *   sidecar and whose writes go through the legacy command port.
 *
 * The handle below is the intersection of the two: the four-state read
 * union (`AppearanceReadState`, the SAME union
 * `inspector/field-state.ts` computes, member for member) plus a
 * value-in/void-out commit pair. `InspectorFieldHandle<T>` is
 * structurally assignable to it — a `Promise`-returning commit is
 * assignable to a `void`-returning one — so the old sections keep
 * working against one implementation instead of a second copy.
 *
 * **Deliberately not the sidecar's type.** `inspector/field-state.ts`
 * reads `AuthoringStateV1`; nothing in the canonical path may depend on
 * that module, so the state union comes from the React-free
 * `puck/read-appearance.ts` instead. The two unions are structurally
 * identical, which is why one set of controls can serve both.
 */

import type { ResponsiveLayerRef } from "@anvilkit/contracts/editor";
import type { AppearanceReadState } from "../../../../../puck/read-appearance.js";

/** One field's state plus the two writes a control can perform. */
export interface StyleFieldHandle<T> {
	/** value | mixed | unset | unsupported, with `resolved` provenance. */
	readonly state: AppearanceReadState<T>;
	/** Write `value` at the active layer across the whole selection. */
	readonly commit: (value: T) => void;
	/** Remove the entry at the active layer (reset-at-layer). */
	readonly reset: () => void;
	/** The layer this handle writes into. */
	readonly layer: ResponsiveLayerRef;
}

/** The durable value, or `undefined` for mixed/unset/unsupported. */
export function fieldValue<T>(state: AppearanceReadState<T>): T | undefined {
	return state.kind === "value" ? state.value : undefined;
}

/**
 * Project a handle onto a different value type.
 *
 * The two directions are independent on purpose: `read` may fail
 * (returning `undefined` collapses the field to `mixed`, which is the
 * honest answer when the stored value is a shape this control cannot
 * represent — a token reference behind a literal editor, say), while
 * `write` always succeeds because the control only ever produces values
 * it can build.
 */
export function mapField<A, B>(
	field: StyleFieldHandle<A>,
	read: (value: A) => B | undefined,
	write: (value: B) => A,
): StyleFieldHandle<B> {
	return {
		state: mapState(field.state, read),
		commit: (value) => field.commit(write(value)),
		reset: field.reset,
		layer: field.layer,
	};
}

function mapState<A, B>(
	state: AppearanceReadState<A>,
	read: (value: A) => B | undefined,
): AppearanceReadState<B> {
	if (state.kind === "value") {
		const mapped = read(state.value);
		// A value this control cannot represent is reported as `mixed`
		// rather than silently rendered as empty: an empty control that
		// commits would overwrite a value the author cannot see.
		if (mapped === undefined) return { kind: "mixed" };
		return {
			kind: "value",
			value: mapped,
			resolved: {
				value: mapped,
				source: state.resolved.source,
				inherited: state.resolved.inherited,
			},
			writtenAtLayer: state.writtenAtLayer,
		};
	}
	if (state.kind === "unset") {
		return {
			kind: "unset",
			resolved: {
				value: undefined,
				source: state.resolved.source,
				inherited: state.resolved.inherited,
			},
		};
	}
	return state;
}
