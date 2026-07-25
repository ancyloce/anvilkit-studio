"use client";

/**
 * @file Chrome-side gate for the accessibility issues block
 * (PLAN-0020 CORE-P1A-012; §28 lazy rules). Tiny static import for
 * the Layers panel; the panel body loads lazily and only inside an
 * editor-enabled `<Studio>`.
 */

import { lazy, type ReactNode, Suspense } from "react";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

const AccessibilityIssuesPanel = lazy(
	() => import("./AccessibilityIssuesPanel.js"),
);

/** Mounts the lazy issues block when the editor is on. */
export function AccessibilityIssuesMount(): ReactNode {
	const handle = useOptionalStudioEditor();
	if (handle === null || handle.status !== "ready") {
		return null;
	}
	return (
		<Suspense fallback={null}>
			<AccessibilityIssuesPanel />
		</Suspense>
	);
}
