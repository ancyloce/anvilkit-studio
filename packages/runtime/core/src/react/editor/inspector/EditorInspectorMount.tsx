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

import type { ReactNode } from "react";
import EditorInspectorPanel from "./EditorInspectorPanel.js";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

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
 * never touch the `<Studio>` entry chunk — measured identical before
 * and after (entry 13,035 B / 50.9%, chrome 72,856 B / 74.1%).
 * Recovering the inner boundary is tracked as a follow-up.
 */

/** Mounts the universal-sections block when the editor is on. */
export function EditorInspectorMount(): ReactNode {
	const handle = useOptionalStudioEditor();
	if (handle === null || handle.status !== "ready") {
		return null;
	}
	return <EditorInspectorPanel />;
}
