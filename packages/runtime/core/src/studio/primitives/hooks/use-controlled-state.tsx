import * as React from "react";

interface CommonControlledStateProps<T> {
	value?: T;
	defaultValue?: T;
}

// biome-ignore lint/suspicious/noExplicitAny: animate-ui upstream
export function useControlledState<T, Rest extends any[] = []>(
	props: CommonControlledStateProps<T> & {
		onChange?: (value: T, ...args: Rest) => void;
	},
): readonly [T, (next: T, ...args: Rest) => void] {
	const { value, defaultValue, onChange } = props;

	const [internalState, setInternalState] = React.useState<T>(
		defaultValue as T,
	);
	// Controlled wins by derivation: rendering `value` directly (instead of
	// mirroring it into state from a useEffect) keeps a controlled update
	// to a single render with no stale frame. The internal state only backs
	// uncontrolled usage; switching modes mid-life is unsupported.
	const state = value !== undefined ? value : internalState;

	const setState = React.useCallback(
		(next: T, ...args: Rest) => {
			setInternalState(next);
			onChange?.(next, ...args);
		},
		[onChange],
	);

	return [state, setState] as const;
}
