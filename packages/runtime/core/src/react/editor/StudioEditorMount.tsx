"use client";

/**
 * @file Flag-gated lazy mount for the editor runtime (PLAN-0020
 * CORE-P0-012, extended by CORE-P1A-001; DD-0019 §22.1, §28 lazy
 * rules).
 *
 * Phase 1A made this a **wrapper**: the editor's contexts
 * (`StudioEditorBridgeContext` for `useStudioEditor()`,
 * `AuthoringStyleContext` for decorated canvas renders) must enclose
 * the `<Puck>` subtree where the chrome and canvas components render.
 * The wrapper itself is entry-chunk safe — the heavy editor runtime
 * still loads through `lazy(() => import(...))` **only** when
 * `editor.features.enabled === true`, as a null-rendering sibling of
 * the children, never suspending them. When the flag is off — or on
 * `chrome="puck"`, whose path never renders this component — children
 * render untouched, nothing is fetched, and no provider mounts:
 * current UI, data behavior, lazy boundaries, and Puck integration
 * remain unchanged.
 */

import type { StudioEditorConfig } from "@anvilkit/contracts/editor";
import {
	lazy,
	type ReactNode,
	Suspense,
	useMemo,
	useSyncExternalStore,
} from "react";
import { BindingRenderMount } from "./bindings/BindingRenderMount.js";
import {
	AuthoringStyleContext,
	type AuthoringStyleLookup,
} from "./authoring-style-context.js";
import type { StudioEditorBridge } from "./bridge.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

const EditorRoot = lazy(() => import("./EditorRoot.js"));

/** Props for {@link StudioEditorMount}. */
export interface StudioEditorMountProps {
	readonly editor: StudioEditorConfig | undefined;
	/** The controller-owned per-instance bridge. */
	readonly bridge: StudioEditorBridge;
	/** The `<Puck>` subtree the editor contexts must enclose. */
	readonly children: ReactNode;
}

/**
 * Wraps children with the editor contexts and mounts the lazily-loaded
 * editor runtime beside them when the feature flag is on; renders
 * children untouched (importing nothing) otherwise.
 */
export function StudioEditorMount({
	editor,
	bridge,
	children,
}: StudioEditorMountProps): ReactNode {
	// Style-lookup identity tracks the style version so decorated
	// renders re-render exactly when resolved styles change — not on
	// selection or diagnostic churn (which bump only the general
	// version). Subscribed unconditionally to keep hook order stable
	// across flag changes.
	const styleVersion = useSyncExternalStore(
		bridge.subscribe,
		bridge.getStyleVersion,
		bridge.getStyleVersion,
	);
	const styleLookup = useMemo<AuthoringStyleLookup | null>(() => {
		// The wrapper closure gives the context value a fresh identity per
		// style version, re-rendering decorated consumers even though the
		// impl-installed lookup reads a mutable index behind a stable
		// function reference.
		void styleVersion;
		const inner = bridge.styleLookup;
		return inner === null ? null : (nodeId: string) => inner(nodeId);
	}, [bridge, styleVersion]);

	if (editor?.features?.enabled !== true) {
		return children;
	}
	return (
		<StudioEditorBridgeContext value={bridge}>
			<AuthoringStyleContext value={styleLookup}>
				{/* Render-time binding resolution (CORE-P3-006): visibility
				    and repeat reach the canvas through this. */}
				<BindingRenderMount bridge={bridge}>{children}</BindingRenderMount>
				<Suspense fallback={null}>
					<EditorRoot editor={editor} bridge={bridge} />
				</Suspense>
			</AuthoringStyleContext>
		</StudioEditorBridgeContext>
	);
}
