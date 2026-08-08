"use client";

/**
 * @file `StyleErrorsProvider` / `useStyleErrors` — the Style panel's
 * commit-error surface (PLAN-0028 `p4-001`).
 *
 * `commitAppearanceUpdate` returns structured `EditorError`s instead of
 * throwing, and a rejected commit writes nothing. Swallowing that
 * return value is how an editor ends up looking like it saved
 * something it did not, so the panel renders it — the same
 * `lastErrors` shape `DataPanel` and `InteractionsPanel` already use,
 * lifted to a context here only because a Style commit originates
 * inside a control rather than in the panel body.
 *
 * Without a provider the reporter is a no-op, so a control rendered
 * outside the panel still works — the same degradation `useWriteLayer`
 * and `useMsg` already have.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import { createContext, type ReactNode, use, useMemo, useState } from "react";

const NO_ERRORS: readonly EditorError[] = Object.freeze([]);

/** The last commit's errors plus the reporter controls call. */
export interface StyleErrors {
	readonly errors: readonly EditorError[];
	/** Replace the reported set; an empty array clears it. */
	readonly report: (errors: readonly EditorError[]) => void;
}

const NOOP: StyleErrors = Object.freeze({
	errors: NO_ERRORS,
	report: () => {
		// Intentionally empty: with no provider there is nowhere to render.
	},
});

const StyleErrorsContext = createContext<StyleErrors>(NOOP);

/** Holds the last Style commit's errors for the panel to render. */
export function StyleErrorsProvider({
	children,
}: {
	readonly children: ReactNode;
}): ReactNode {
	const [errors, setErrors] = useState<readonly EditorError[]>(NO_ERRORS);
	const value = useMemo<StyleErrors>(
		() => ({
			errors,
			report: (next) => setErrors(next.length === 0 ? NO_ERRORS : next),
		}),
		[errors],
	);
	return <StyleErrorsContext value={value}>{children}</StyleErrorsContext>;
}

/** The panel's error surface. */
export function useStyleErrors(): StyleErrors {
	return use(StyleErrorsContext);
}
