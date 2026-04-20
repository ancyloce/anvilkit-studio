/**
 * @file Per-key composition for `@puckeditor/core` overrides
 * (task `core-014`).
 *
 * ### The correctness risk this file resolves
 *
 * Architecture §18 item #1 calls out override merging as the known
 * highest-risk correctness bug in the plugin system:
 *
 * > Puck 0.21 overrides are render functions keyed by slot name.
 * > Multiple plugins overriding the same key must **compose** so the
 * > output of the first plugin becomes the `children` of the next.
 * > A flat `{...a, ...b}` spread silently drops the earlier plugin.
 *
 * `compilePlugins()` (`core-008`) preserves the raw per-plugin
 * override slices as a registration-ordered array on
 * `StudioRuntime.overrides`. This file folds that array (plus the
 * consumer's own `overrides` prop) into the single
 * `Partial<PuckOverrides>` the `<Studio>` component hands to
 * `<Puck overrides={…}>`.
 *
 * ### Composition semantics
 *
 * For every override key, we produce a single wrapper function that
 * calls each plugin in registration order, passing the previous
 * plugin's output as `children`. Given plugins `[A, B, C]` all
 * supplying `fieldLabel`, the final override for that key is
 * conceptually:
 *
 * ```ts
 * (props) =>
 *   C({
 *     ...props,
 *     children: B({
 *       ...props,
 *       children: A({ ...props, children: props.children }),
 *     }),
 *   });
 * ```
 *
 * - **First-registered is innermost.** Plugin A runs closest to the
 *   default render — its output is what plugins B and C wrap. This
 *   mirrors `@puckeditor/core`'s own internal `loadOverrides()`.
 * - **Last-registered is outermost.** Consumer-supplied overrides
 *   are passed as the final entry in the input array, which puts
 *   them on the outside: the consumer gets the last word about what
 *   the user sees.
 * - **Empty input → `{}`.** An empty array is a valid no-op merge.
 *
 * ### The `fieldTypes` special case
 *
 * `PuckOverrides.fieldTypes` is a dictionary of
 * `fieldType → FunctionComponent` rather than a single render
 * function. This helper composes each inner component the same way
 * the top-level keys are composed — two plugins both supplying
 * `fieldTypes.text` get folded into one wrapper. Every other key is
 * validated to be a function; non-function values throw a
 * {@link TypeError} so a typo fails loud instead of silently
 * breaking Puck at render time.
 *
 * ### Scope
 *
 * This helper does not know about `<Studio>`, plugins, or React
 * hooks — it is a pure function over a flat array of override
 * objects. That isolation lets the test harness exercise it with
 * synthetic render functions and still pin the composition contract.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-014-studio-component.md | core-014}
 */

import type { Overrides as PuckOverrides } from "@puckeditor/core";

/**
 * The `fieldTypes` key is the sole structural outlier in
 * {@link PuckOverrides}: a dictionary of
 * `field-type → FunctionComponent` rather than a single
 * `RenderFunc`. Extracted as a local alias so the nested-merge code
 * path can type-narrow against it without re-deriving the shape at
 * every call site.
 *
 * Marked as a loose function record because Puck's own
 * `FieldRenderFunctions` type is parameterized on the user's Puck
 * config generic — a parameter this helper deliberately does not
 * accept, since it must handle every plugin's slice generically.
 */
type FieldTypesOverride = Record<
	string,
	(props: Record<string, unknown>) => unknown
>;

/**
 * Internal signature every non-`fieldTypes` override key conforms
 * to. We erase Puck's strict `RenderFunc` parameterization so the
 * folded-wrapper function can forward arbitrary props without
 * re-stating each key's prop shape — Puck's own types re-tighten at
 * the `<Puck>` boundary.
 */
type AnyRenderFunc = (props: Record<string, unknown>) => unknown;

/**
 * Compose a list of plugin-contributed Puck override slices into a
 * single {@link PuckOverrides} dictionary, with per-key currying so
 * multiple plugins touching the same key all run.
 *
 * The input array is consumed in order: earlier entries become
 * **innermost** wrappers (closer to the default render), later
 * entries become **outermost**. This matches Puck 0.21's own
 * internal composition so feeding the result back into
 * `<Puck overrides={…}>` is semantically identical to letting Puck
 * register each plugin individually — just done once, upfront, so
 * `<Studio>` can also fold in consumer-supplied overrides in the
 * same pass.
 *
 * @param overridesList - Plugin override slices in the order they
 * should compose. Pass `[...runtime.overrides, consumerOverrides]`
 * to get consumer-outermost semantics.
 * @throws {TypeError} If any non-`fieldTypes` override value is not
 * a function, or if any entry inside a `fieldTypes` dictionary is
 * not a function.
 * @returns A single `Partial<PuckOverrides>` ready to hand to
 * `<Puck overrides={…}>`. Returns `{}` for an empty input.
 *
 * @example
 * ```ts
 * const merged = mergeOverrides([
 *   { fieldLabel: (props) => <span className="a">{props.children}</span> },
 *   { fieldLabel: (props) => <span className="b">{props.children}</span> },
 * ]);
 * // merged.fieldLabel renders: <span class="b"><span class="a">{default}</span></span>
 * ```
 */
export function mergeOverrides(
	overridesList: readonly Partial<PuckOverrides>[],
): Partial<PuckOverrides> {
	// Use a local untyped bag while folding. `PuckOverrides` is too
	// strict to express "some keys are present, others are not, and
	// each present key has a different prop shape" in a way that
	// typechecks inside the loop — we re-assert the final shape on
	// the way out instead.
	const accumulator: Record<string, unknown> = {};

	for (const slice of overridesList) {
		// Defensive against `null` / `undefined` entries even though the
		// parameter type forbids them: `[...runtime.overrides, consumer]`
		// is a common caller pattern where `consumer` may be absent, and
		// tests pin this tolerance so the helper stays robust under
		// `as unknown as` casts from callers.
		if (slice === null || slice === undefined) {
			continue;
		}

		for (const key of Object.keys(slice) as Array<keyof PuckOverrides>) {
			const next = slice[key];
			if (next === undefined) {
				// `Partial<Overrides>` permits `key: undefined`; treat it
				// the same as "key not present" so consumers can opt a
				// plugin out by explicitly clearing a key.
				continue;
			}

			if (key === "fieldTypes") {
				accumulator.fieldTypes = composeFieldTypes(
					accumulator.fieldTypes as FieldTypesOverride | undefined,
					next as FieldTypesOverride,
					key,
				);
				continue;
			}

			if (typeof next !== "function") {
				throw new TypeError(
					`mergeOverrides: override "${String(key)}" must be a function, received ${typeOf(
						next,
					)}`,
				);
			}

			accumulator[key] = composeRenderFunc(
				accumulator[key] as AnyRenderFunc | undefined,
				next as AnyRenderFunc,
			);
		}
	}

	// The accumulator is structurally a `Partial<PuckOverrides>` — we
	// only ever wrote keys that exist on the Puck type and we
	// validated every value as a function (or as a composed
	// `fieldTypes` dictionary). The `as` cast is the handoff point
	// back to Puck's strict typing.
	return accumulator as Partial<PuckOverrides>;
}

/**
 * Compose a single new render function on top of whatever has been
 * accumulated so far for this key.
 *
 * If no prior function exists, the new one is used verbatim —
 * there's nothing to wrap and introducing a trivial wrapper would
 * change React's component identity for no reason, defeating memo
 * boundaries downstream.
 *
 * When a prior function exists, the returned wrapper calls the new
 * override with `children` set to the *result* of calling the prior
 * accumulation with the same outer props. That's the exact shape
 * Puck's own `loadOverrides()` produces, so the merged output is
 * indistinguishable from letting Puck compose the plugins itself.
 */
function composeRenderFunc(
	prev: AnyRenderFunc | undefined,
	next: AnyRenderFunc,
): AnyRenderFunc {
	if (prev === undefined) {
		return next;
	}

	return (props) =>
		next({
			...props,
			// Render the prior accumulation first; its output becomes
			// the `children` the new override receives. This is the
			// per-key curry — a flat spread merge would drop `prev`
			// entirely.
			children: prev({ ...props }),
		});
}

/**
 * Merge two `fieldTypes` dictionaries, composing any entry that
 * exists in both via {@link composeRenderFunc}.
 *
 * Declared as its own helper so the type narrowing stays contained
 * and the main loop is readable. The `parentKey` parameter is used
 * only for the error message so it names the full path
 * (`fieldTypes.text`) when a non-function value leaks through.
 */
function composeFieldTypes(
	prev: FieldTypesOverride | undefined,
	next: FieldTypesOverride,
	parentKey: string,
): FieldTypesOverride {
	// Copy `prev` so we never mutate the caller's dictionary — the
	// input array is logically read-only even though TypeScript can't
	// enforce that through the `Partial<PuckOverrides>` cast.
	const merged: FieldTypesOverride = { ...(prev ?? {}) };

	for (const fieldType of Object.keys(next)) {
		const candidate = next[fieldType];
		if (candidate === undefined) {
			continue;
		}
		if (typeof candidate !== "function") {
			throw new TypeError(
				`mergeOverrides: override "${parentKey}.${fieldType}" must be a function, received ${typeOf(
					candidate,
				)}`,
			);
		}
		merged[fieldType] = composeRenderFunc(merged[fieldType], candidate);
	}

	return merged;
}

/**
 * `typeof` with a special case for `null` so error messages can
 * distinguish `null` from `object` — a small quality-of-life win
 * for debugging a bad override slice.
 */
function typeOf(value: unknown): string {
	if (value === null) {
		return "null";
	}
	return typeof value;
}
