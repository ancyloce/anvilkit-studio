"use client";

/**
 * @file Chrome-side gate for the responsive toolbar (PLAN-0020
 * CORE-P1A-008; §28 lazy rules). Statically imported by the viewport
 * preview but tiny: the toolbar body loads lazily and only when the
 * enclosing `<Studio>` has the editor feature enabled, so legacy
 * studios fetch nothing and render nothing here.
 */

import { lazy, type ReactNode, Suspense } from "react";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

const ResponsiveToolbar = lazy(() => import("./ResponsiveToolbar.js"));

/** Mounts the lazy responsive toolbar when the editor is on. */
export function ResponsiveToolbarMount(): ReactNode {
	const handle = useOptionalStudioEditor();
	if (handle === null || handle.status !== "ready") {
		return null;
	}
	return (
		<Suspense fallback={null}>
			<ResponsiveToolbar />
		</Suspense>
	);
}
