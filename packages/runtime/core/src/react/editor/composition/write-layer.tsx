"use client";

/**
 * @file `WriteLayerProvider` / `useWriteLayer` — the shell's single
 * "which responsive layer am I authoring into" value (PLAN-0028
 * `p4-004`).
 *
 * **One value, every panel.** A Style panel writing to `md` while a
 * Data panel believes it is on `base` is a defect class that only
 * appears when two panels disagree, and it is cheap to prevent
 * structurally: the shell holds exactly one layer and hands the same
 * one to all of them.
 *
 * **Editor state, not document state.** Same rule as `mode` and
 * `targetId` (`p3-007`): the active write layer is where the author is
 * *pointing*. It never enters `Data` and never enters history. The
 * layer it writes **into** is declared responsive state inside
 * `props.appearance` — the pointer is ephemeral, the value it writes is
 * declared. That distinction is the whole point.
 *
 * Without a provider the value is `"base"` with a no-op setter, so a
 * panel rendered under a bare `<Puck>` still works — the same
 * degradation `useMsg` already has when no i18n provider is mounted.
 */

import type { ResponsiveLayerRef } from "@anvilkit/contracts/editor";
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

/** The shell's active write layer plus its setter. */
export interface ShellWriteLayer {
	/** `"base"` or an enabled breakpoint id. */
	readonly layer: ResponsiveLayerRef;
	/** Move every panel's write target at once. */
	readonly setLayer: (next: ResponsiveLayerRef) => void;
}

/**
 * The no-provider fallback: authoring goes to `base` and nothing can
 * move it. Frozen so a consumer cannot mutate the shared default.
 */
const BASE_ONLY: ShellWriteLayer = Object.freeze({
	layer: "base" as const,
	setLayer: () => {
		// Intentionally empty: with no provider there is no layer to move.
	},
});

const WriteLayerContext = createContext<ShellWriteLayer>(BASE_ONLY);

/** Props for {@link WriteLayerProvider}. */
export interface WriteLayerProviderProps {
	readonly children: ReactNode;
	/** Initial layer; defaults to `"base"`. Uncontrolled. */
	readonly defaultLayer?: ResponsiveLayerRef;
	/**
	 * Controlled layer. When supplied the provider stops holding its
	 * own state and defers entirely to the host — which is how
	 * `p4-005`'s viewport toolbar makes "previewing mobile" and
	 * "authoring mobile" one state rather than two that can disagree.
	 */
	readonly layer?: ResponsiveLayerRef;
	/** Called on every layer change, controlled or not. */
	readonly onLayerChange?: (next: ResponsiveLayerRef) => void;
}

/**
 * Provides the one write layer to every panel beneath it.
 *
 * Controlled when `layer` is supplied, uncontrolled otherwise —
 * the standard React pattern, so a host that already owns a viewport
 * value does not end up with a second one.
 */
export function WriteLayerProvider({
	children,
	defaultLayer = "base",
	layer,
	onLayerChange,
}: WriteLayerProviderProps): ReactNode {
	const [uncontrolled, setUncontrolled] =
		useState<ResponsiveLayerRef>(defaultLayer);
	const active = layer ?? uncontrolled;
	const value = useMemo<ShellWriteLayer>(
		() => ({
			layer: active,
			setLayer: (next) => {
				if (layer === undefined) setUncontrolled(next);
				onLayerChange?.(next);
			},
		}),
		[active, layer, onLayerChange],
	);
	return <WriteLayerContext value={value}>{children}</WriteLayerContext>;
}

/**
 * The active write layer. Every panel that writes a layered carrier
 * reads it from here rather than holding its own.
 */
export function useWriteLayer(): ShellWriteLayer {
	return use(WriteLayerContext);
}

/**
 * Bind the shell's write layer to the **viewport controller**, which is
 * the editor's pre-existing owner of "which layer am I authoring into"
 * (`ResponsiveEditorState.activeBreakpoint`).
 *
 * ### Why this exists, and why a plain context was not enough
 *
 * The canvas overlay renders *outside* `<Puck>` — `StudioEditorMount`
 * mounts `EditorRoot` as a sibling of the Puck subtree, and
 * `createPortal` keeps React context at the point of render, so no
 * canvas component can read a context provided inside the shell. The
 * canvas therefore reads the layer through the bridge
 * (`bridge.responsive.getActiveLayer()`), as do
 * `inspector/use-inspector.ts` and `tokens/use-design-system.ts`.
 *
 * A shell-local `useState` would have made the composition panels a
 * *second* source: the Style panel could write `md` while the canvas
 * handles wrote `base`. That is precisely the defect `p4-004` exists to
 * prevent, and a context alone cannot prevent it across a portal
 * boundary. So the provider is driven as a **controlled** value off the
 * one controller both sides already see — the panels and the canvas
 * then read the same state through two different transports rather than
 * holding two states.
 *
 * Degrades honestly: with no editor bridge (a bare `<Puck>`) the layer
 * is `undefined` here, which leaves {@link WriteLayerProvider}
 * uncontrolled and authoring goes to `base`.
 */
export function useViewportWriteLayer(): {
	readonly layer: ResponsiveLayerRef | undefined;
	readonly setLayer: (next: ResponsiveLayerRef) => void;
} {
	const viewport = useOptionalStudioEditor()?.viewport ?? null;
	const subscribe = useCallback(
		(onChange: () => void) =>
			viewport === null ? noopUnsubscribe : viewport.subscribe(onChange),
		[viewport],
	);
	const getSnapshot = useCallback(
		() => viewport?.getState().activeBreakpoint,
		[viewport],
	);
	const layer = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const setLayer = useCallback(
		(next: ResponsiveLayerRef) => {
			// An explicit choice pins the target (the controller disables
			// follow mode itself) — the toolbar and the panels agree because
			// they are the same call.
			viewport?.setWriteTarget(next);
		},
		[viewport],
	);
	return { layer, setLayer };
}

function noopUnsubscribe(): void {
	// Intentionally empty: with no controller there is nothing to unsubscribe.
}
