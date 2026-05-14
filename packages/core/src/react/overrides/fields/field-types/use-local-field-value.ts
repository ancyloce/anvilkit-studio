/**
 * @file Focus-aware local-value buffer for AnvilKit field-type
 * overrides.
 *
 * Mirrors the semantics of Puck's internal `useLocalValue`
 * (`@puckeditor/core` `components/AutoField/lib/use-local-value.ts`):
 * the controlled input is driven by a local string buffer; while the
 * field is focused, external `value` prop updates are *not* pushed
 * into the buffer, so async re-renders of the AutoField subtree (e.g.
 * from the collab plugin's atomic `replace` dispatches) cannot
 * reconcile the input against a value that briefly disagrees with the
 * DOM — which is what otherwise clamps the caret to the end.
 *
 * Puck does not export `useLocalValue` or `useIsFocused`, and an
 * override registered via `studioOverrides.fieldTypes` is handed the
 * raw store value without local buffering
 * (`@puckeditor/core` `chunk-PK2F2YZX.mjs:2155-2168`). The hook here
 * uses DOM focus tracking instead of Puck's app-store focus key, so
 * it stays self-contained.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ParseResult<T> = { ok: true; value: T } | { ok: false };

export interface UseLocalFieldValueResult {
	readonly displayValue: string;
	readonly onInputChange: (raw: string) => void;
	readonly onFocus: () => void;
	readonly onBlur: () => void;
}

/**
 * Buffer a controlled input's displayed string against external
 * `value`-prop churn while the field is focused.
 *
 * @param externalValue
 *   The latest value from Puck's field store.
 * @param parse
 *   Convert raw input-text to the parent's value type. Return
 *   `{ ok: false }` to ignore unparseable intermediate states (e.g.
 *   partial number entries like `"1."`) without committing.
 * @param format
 *   Convert the parent's value type back to a display string. Used
 *   to seed the initial buffer and to re-sync on blur or when the
 *   external value changes while the field is unfocused.
 * @param onCommit
 *   Forward a successfully-parsed value to Puck. Called on every
 *   keystroke that parses successfully, so the collab write path
 *   stays in lockstep with the user's typing.
 */
export function useLocalFieldValue<T>(
	externalValue: T,
	parse: (raw: string) => ParseResult<T>,
	format: (value: T) => string,
	onCommit: (value: T) => void,
): UseLocalFieldValueResult {
	const [displayValue, setDisplayValue] = useState<string>(() =>
		format(externalValue),
	);
	// `focusedRef` (not `useState`) so toggling focus does not cause an
	// extra render — the only thing that needs to react to focus
	// transitions is the external-value sync effect below, and that
	// reads the ref at run-time.
	const focusedRef = useRef(false);
	// Track the latest `format` / `onCommit` so the input handler's
	// closures stay stable across renders even when consumers pass
	// inline arrows. Without this, every parent re-render produces a
	// fresh `onInputChange` identity, which is harmless for behavior
	// but defeats memoization further down the tree.
	const formatRef = useRef(format);
	const onCommitRef = useRef(onCommit);
	useEffect(() => {
		formatRef.current = format;
		onCommitRef.current = onCommit;
	}, [format, onCommit]);

	useEffect(() => {
		if (!focusedRef.current) {
			setDisplayValue(formatRef.current(externalValue));
		}
	}, [externalValue]);

	const onInputChange = useCallback(
		(raw: string) => {
			setDisplayValue(raw);
			const result = parse(raw);
			if (result.ok) onCommitRef.current(result.value);
		},
		[parse],
	);

	const onFocus = useCallback(() => {
		focusedRef.current = true;
	}, []);

	const onBlur = useCallback(() => {
		focusedRef.current = false;
		// Re-sync from the latest external value so any remote write
		// that arrived during typing becomes visible the instant the
		// user releases focus. The closure reads `externalValue` from
		// the outer scope of this render, but the ref-backed
		// `formatRef` ensures we apply the latest formatter.
		setDisplayValue(formatRef.current(externalValue));
	}, [externalValue]);

	return { displayValue, onInputChange, onFocus, onBlur };
}
