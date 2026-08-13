"use client";

/**
 * @file `useShallowStable` — hold a host prop's IDENTITY steady while its
 * contents are unchanged (review 0036 H-4).
 *
 * `<Studio>` already tolerates unstable host props in two other ways:
 * `plugins` and `config` are structurally fingerprinted, and every
 * callback prop is ref-boxed. Both exist because writing
 * `<Studio plugins={[…]} />` inline — the ordinary way to pass an
 * object or array prop — produces a brand-new identity on every parent
 * render, and the controller keys expensive work off those identities.
 *
 * Neither technique fits a prop whose VALUES are functions:
 * a fingerprint cannot serialize them, and ref-boxing would pin the
 * first value forever so a genuine change never applied. Shallow
 * identity comparison is the right middle: an inline
 * `overrides={{ header: MyHeader }}` re-renders to a new object holding
 * the *same* `MyHeader`, so the held reference survives, while swapping
 * in a different `MyHeader` is picked up immediately.
 *
 * The ref is written during render. That is deliberate and safe here:
 * the write is idempotent and the return value depends only on the
 * argument, so a StrictMode double-render (or a discarded render pass)
 * produces the same result. This is the standard "cache the previous
 * value" escape hatch, not shared mutable state.
 */

import type { StudioEditorConfig } from "@anvilkit/contracts/editor";
import { useRef } from "react";

/** `Object.is` on every own enumerable key, one level deep. */
export function shallowEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true;
	}
	if (
		typeof a !== "object" ||
		a === null ||
		typeof b !== "object" ||
		b === null ||
		Array.isArray(a) !== Array.isArray(b)
	) {
		return false;
	}
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const leftKeys = Object.keys(left);
	if (leftKeys.length !== Object.keys(right).length) {
		return false;
	}
	return leftKeys.every(
		(key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]),
	);
}

/**
 * Return the previously-held value while `value` is shallow-equal to it,
 * so a fresh-but-equivalent object does not read as a change.
 */
export function useShallowStable<T>(value: T): T {
	const held = useRef(value);
	if (!shallowEqual(held.current, value)) {
		held.current = value;
	}
	return held.current;
}

/**
 * Stabilize the raw Studio editor prop, including its inline feature flags.
 *
 * The outer config is only shallow-compared because its adapter members are
 * function bags whose identities are meaningful. `features` is the one nested
 * value hosts routinely write inline, so stabilize it first; otherwise
 * `editor={{ features: { enabled: true } }}` would still look different on
 * every render even though the flags are unchanged.
 */
export function useStableEditorConfig(
	value: StudioEditorConfig | undefined,
): StudioEditorConfig | undefined {
	const features = useShallowStable(value?.features);
	return useShallowStable(
		value === undefined || value.features === features
			? value
			: { ...value, features },
	);
}
