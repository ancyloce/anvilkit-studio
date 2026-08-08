"use client";

/**
 * @file `TokenModeProvider` / `useTokenMode` — the shell's single
 * "which token mode am I previewing and authoring in" value
 * (PLAN-0028 `p5-007`; DD-0019 `ED-FA-006`; PLAN-0026 §3.8.3).
 *
 * The sibling of {@link useWriteLayer} and deliberately the same
 * shape. One value, held by the shell, read by every panel *and* by
 * the canvas — because the Design System panel is where the mode is
 * chosen and the canvas is where the choice has to be visible. A
 * panel-local `useState` could not reach the canvas at all, and two
 * states (one per column) is the defect class the write-layer
 * provider exists to prevent structurally rather than by convention.
 *
 * **Editor state, not document state.** Which mode is *previewed* is
 * where the author is pointing; the mode's *values* are declared
 * state inside `root.props.designSystem.tokens[*].values[modeId]`.
 * The pointer never enters `Data` and never enters history; the
 * values it points at are declared and do. That distinction is the
 * whole point — switching to dark must not be an undo step, and
 * editing the dark value must be.
 *
 * ## Puck contract
 *
 * **Rule 3 — one pipeline, four consumers.** This module holds an id
 * and nothing else. It resolves no token and computes no CSS: the
 * chosen mode is handed to `useCompiledAppearance` →
 * `compileDocumentAppearance`, the *same* compiler the preview, the
 * production render and the export run. That is what makes the live
 * preview trustworthy rather than an approximation — the editor is
 * not previewing a mode, it is running the production computation
 * with a different mode id.
 *
 * ## Why there is no controlled variant
 *
 * {@link WriteLayerProvider} is controlled/uncontrolled because
 * `undefined` is not a legitimate layer. Here it is: `undefined`
 * means "no override — compile against the document's own
 * `defaultTokenMode`", which is the state the shell starts in. The
 * `value ?? uncontrolled` idiom therefore cannot express the
 * difference between "uncontrolled" and "controlled to the document
 * default", so the provider is uncontrolled only. A host that needs
 * to own the value can lift it the day a caller exists; inventing the
 * seam now would mean shipping an ambiguity with no user.
 *
 * Without a provider the mode is `undefined` with a no-op setter, so
 * a panel rendered under a bare `<Puck>` still works — the same
 * degradation `useMsg` and `useWriteLayer` already have.
 */

import { createContext, type ReactNode, use, useMemo, useState } from "react";

/** The shell's previewed token mode plus its setter. */
export interface ShellTokenMode {
	/**
	 * The mode id every consumer compiles against, or `undefined` for
	 * "the document's `defaultTokenMode`". Never a resolved value —
	 * resolution belongs to the compiler (rule 3).
	 */
	readonly tokenMode: string | undefined;
	/** Move every consumer's mode at once. `undefined` clears the override. */
	readonly setTokenMode: (next: string | undefined) => void;
}

/**
 * The no-provider fallback: the document's own default, and nothing
 * can move it. Frozen so a consumer cannot mutate the shared default.
 */
const DOCUMENT_DEFAULT: ShellTokenMode = Object.freeze({
	tokenMode: undefined,
	setTokenMode: () => {
		// Intentionally empty: with no provider there is no mode to move.
	},
});

const TokenModeContext = createContext<ShellTokenMode>(DOCUMENT_DEFAULT);

/**
 * The mode ids ADR 0005 Part 2 §5 reserves, mapped to the catalog key
 * that names them.
 *
 * §5's rule: "document-token mode IDs `light`/`dark` must mean the
 * same thing as the theme system's dark overrides so a future bridge
 * is possible." Two things follow, and both are enforced here rather
 * than in prose:
 *
 * 1. The mode switch **offers only modes the document declares** — it
 *    never creates one, so it cannot mint a third reserved id or
 *    redefine these two.
 * 2. When a declared mode carries no author-given name (its `name`
 *    is its id, which is what {@link readDesignSystem} synthesizes),
 *    a reserved id renders under its *reserved* label in the reader's
 *    locale rather than as the raw string `light`. An author who does
 *    name their mode keeps their name — the reservation is on the id's
 *    meaning, not on the label.
 */
const RESERVED_TOKEN_MODE_LABEL_KEYS = {
	light: "studio.editor.token.mode.light",
	dark: "studio.editor.token.mode.dark",
} as const;

/** A mode id whose meaning ADR 0005 Part 2 §5 reserves. */
export type ReservedTokenModeId = keyof typeof RESERVED_TOKEN_MODE_LABEL_KEYS;

/**
 * The catalog key naming a reserved mode id, or `undefined` for every
 * other id — which is every mode the author invented, and those are
 * rendered under the name the author gave them.
 */
export function reservedTokenModeLabelKey(
	modeId: string,
): (typeof RESERVED_TOKEN_MODE_LABEL_KEYS)[ReservedTokenModeId] | undefined {
	return RESERVED_TOKEN_MODE_LABEL_KEYS[modeId as ReservedTokenModeId];
}

/** Props for {@link TokenModeProvider}. */
export interface TokenModeProviderProps {
	readonly children: ReactNode;
	/**
	 * Mode the shell starts on. Defaults to `undefined` — the
	 * document's own `defaultTokenMode`, resolved by the compiler.
	 */
	readonly defaultTokenMode?: string;
}

/** Provides the one previewed token mode to everything beneath it. */
export function TokenModeProvider({
	children,
	defaultTokenMode,
}: TokenModeProviderProps): ReactNode {
	const [tokenMode, setTokenMode] = useState<string | undefined>(
		defaultTokenMode,
	);
	const value = useMemo<ShellTokenMode>(
		() => ({ tokenMode, setTokenMode }),
		[tokenMode],
	);
	return <TokenModeContext value={value}>{children}</TokenModeContext>;
}

/**
 * The previewed token mode. The Design System panel writes it, the
 * canvas compiles against it, and neither holds its own copy.
 */
export function useTokenMode(): ShellTokenMode {
	return use(TokenModeContext);
}
