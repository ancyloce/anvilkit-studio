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
import { createContext, type ReactNode, use, useMemo, useState } from "react";

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
	setLayer: () => {},
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
