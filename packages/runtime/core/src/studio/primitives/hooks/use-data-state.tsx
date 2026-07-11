"use client";

import * as React from "react";

type DataStateValue = string | boolean | null;

function parseDatasetValue(value: string | null): DataStateValue {
	if (value === null) return null;
	if (value === "" || value === "true") return true;
	if (value === "false") return false;
	return value;
}

function useDataState<T extends HTMLElement = HTMLElement>(
	key: string,
	forwardedRef?: React.Ref<T | null>,
	onChange?: (value: DataStateValue) => void,
): [DataStateValue, React.RefObject<T | null>] {
	const localRef = React.useRef<T | null>(null);
	React.useImperativeHandle(forwardedRef, () => localRef.current as T);

	// RX-1: stabilize both callbacks on `[key]` so `useSyncExternalStore`
	// does not tear down + recreate the `MutationObserver` on every
	// commit (`localRef` is a stable ref, so it is not a dependency).
	const getSnapshot = React.useCallback((): DataStateValue => {
		const el = localRef.current;
		return el ? parseDatasetValue(el.getAttribute(`data-${key}`)) : null;
	}, [key]);

	const subscribe = React.useCallback(
		(callback: () => void) => {
			const el = localRef.current;
			if (!el) {
				return () => {
					// no element to observe — no-op cleanup
				};
			}
			const observer = new MutationObserver((records) => {
				for (const record of records) {
					if (record.attributeName === `data-${key}`) {
						callback();
						break;
					}
				}
			});
			observer.observe(el, {
				attributes: true,
				attributeFilter: [`data-${key}`],
			});
			return () => observer.disconnect();
		},
		[key],
	);

	const value = React.useSyncExternalStore(subscribe, getSnapshot);

	// `value` comes from an external MutationObserver subscription (Base UI
	// flips the `data-*` attribute, not any handler in this component), so
	// there is no event handler that could invoke `onChange` instead —
	// effect-driven notification is the correct shape here.
	React.useEffect(() => {
		if (onChange) onChange(value);
	}, [value, onChange]);

	return [value, localRef];
}

export { type DataStateValue, useDataState };
