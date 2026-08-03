"use client";

/**
 * @file `EditorInspectorMount` — the chrome-side gate for the
 * inspector body (PLAN-0020 CORE-P1A-005; §28 lazy rules).
 *
 * Statically imported by `FieldsPanel`, which hands it the rendered
 * native Puck field tree. Two shapes come out:
 *
 * - **editor ready** — the four-tab inspector
 *   ({@link EditorInspectorTabs}), with the native fields placed under
 *   its `properties` tab;
 * - **editor off / still loading** — the native fields alone, in the
 *   same scroll container `FieldsPanel` always used, with no
 *   editor-only section anywhere (ED-INSPECT-002 regression rule).
 *
 * Owning the scroll container here (rather than in `FieldsPanel`) is
 * what lets the tabbed shape pin its tab strip and scroll only the
 * active panel, while the legacy shape keeps its byte-identical
 * single-scroll body.
 */

import type { ReactNode } from "react";
import { useOptionalStudioEditor } from "../use-studio-editor.js";
import { EditorInspectorTabs } from "./EditorInspectorTabs.js";

/**
 * Statically imported, deliberately (CORE-P1B close). The lazy
 * boundary this mount used to carry NEVER RESOLVED in `apps/studio`
 * — in dev *and* in a production build — leaving the universal
 * inspector permanently suspended and invisible to users. Verified by
 * bisection: the engine barrel, `use-inspector`, and all four section
 * modules each import fine on their own through the same
 * `lazy(() => import(...))` pattern (which also works for the sibling
 * a11y and responsive-toolbar mounts), so the fault sits in this one
 * chunk boundary, not in the panel's dependencies.
 *
 * §28 impact: none. `FieldsPanel`, this mount's only caller, already
 * ships inside the async `StudioLayout` chunk, so the panel's bytes
 * never touch the `<Studio>` entry chunk. Recovering the inner
 * boundary is tracked as a follow-up.
 */

export interface EditorInspectorMountProps {
	/**
	 * The native Puck field tree as `FieldsPanel` rendered it (grouping,
	 * ordering, loading state included). Optional so the mount stays
	 * safe to render bare in tests and future surfaces.
	 */
	readonly properties?: ReactNode;
}

/** Mounts the tabbed inspector when the editor is on. */
export function EditorInspectorMount({
	properties,
}: EditorInspectorMountProps): ReactNode {
	const handle = useOptionalStudioEditor();
	if (handle === null || handle.status !== "ready") {
		return <div className="min-h-0 flex-1 overflow-auto">{properties}</div>;
	}
	return <EditorInspectorTabs properties={properties} />;
}
