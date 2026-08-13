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
import { lazy, type ReactNode, Suspense } from "react";
import type { StudioEditorBridge } from "./bridge.js";
import { TokenRecentsProvider } from "./composition/design-system/token-recents.js";
import { EditorSurfaceSlot } from "./EditorSurfaceSlot.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

const EditorRoot = lazy(() => import("./EditorRoot.js"));

/** Props for {@link StudioEditorMount}. */
export interface StudioEditorMountProps {
	readonly editor: StudioEditorConfig | undefined;
	/** The controller-owned per-instance bridge. */
	readonly bridge: StudioEditorBridge;
	/**
	 * Host node for the persistent editor slot
	 * (`StudioProps.editorSlot`). Rendered inside the editor providers,
	 * beside the `<Puck>` subtree, so it survives popover and rail-tab
	 * churn (CORE-P3-008).
	 */
	readonly editorSlot?: ReactNode;
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
	editorSlot,
	children,
}: StudioEditorMountProps): ReactNode {
	if (editor?.features?.enabled !== true) {
		return children;
	}
	// P6-01 (PLAN-0025 §11.3): the authoring style context and the
	// legacy binding render mount are GONE with config decoration —
	// v2 appearance reaches the canvas through the compiled-appearance
	// mount, and binding evaluation rides the official resolveData
	// adapter.
	return (
		<TokenRecentsProvider>
			<StudioEditorBridgeContext value={bridge}>
				{children}
				{/* Persistent host/plugin chrome (CORE-P3-008). A sibling of
			    the Puck subtree, not a child of any popover or rail
			    module, so a multi-step flow survives menu churn. */}
				<EditorSurfaceSlot hostSlot={editorSlot} />
				<Suspense fallback={null}>
					<EditorRoot editor={editor} bridge={bridge} />
				</Suspense>
			</StudioEditorBridgeContext>
		</TokenRecentsProvider>
	);
}
