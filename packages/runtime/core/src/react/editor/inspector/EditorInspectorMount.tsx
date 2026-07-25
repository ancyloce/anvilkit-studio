"use client";

/**
 * @file `EditorInspectorMount` — the chrome-side gate for the
 * universal inspector (PLAN-0020 CORE-P1A-005; §28 lazy rules).
 *
 * Statically imported by `FieldsPanel` but tiny: the panel body loads
 * through `lazy(() => import(...))` **only** when the enclosing
 * `<Studio>` has the editor feature enabled (bridge context present).
 * Legacy studios render `null` here and fetch nothing, keeping
 * `FieldsPanel`'s output byte-identical with features off
 * (ED-INSPECT-002 regression rule).
 */

import { lazy, type ReactNode, Suspense } from "react";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

const EditorInspectorPanel = lazy(() => import("./EditorInspectorPanel.js"));

/** Mounts the lazy universal-sections block when the editor is on. */
export function EditorInspectorMount(): ReactNode {
	const handle = useOptionalStudioEditor();
	if (handle === null || handle.status !== "ready") {
		return (
			<span
				data-ak-inspector-gate={handle === null ? "no-bridge" : handle.status}
				hidden
			/>
		);
	}
	return (
		<Suspense fallback={null}>
			<EditorInspectorPanel />
		</Suspense>
	);
}
