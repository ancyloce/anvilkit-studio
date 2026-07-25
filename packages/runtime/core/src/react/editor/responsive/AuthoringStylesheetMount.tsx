"use client";

/**
 * @file Chrome-side gate for the authoring stylesheet binding
 * (PLAN-0020 CORE-P1A-009; §28 lazy rules). Statically imported by
 * `CanvasIframe` but tiny: the binding loads lazily and only inside
 * an editor-enabled `<Studio>` with a live iframe document.
 */

import { lazy, type ReactNode, Suspense, use } from "react";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

const AuthoringStylesheet = lazy(() => import("./AuthoringStylesheet.js"));

/** Props for {@link AuthoringStylesheetMount}. */
export interface AuthoringStylesheetMountProps {
	readonly document: Document | undefined;
}

/** Mounts the lazy stylesheet binding when the editor is on. */
export function AuthoringStylesheetMount({
	document: iframeDoc,
}: AuthoringStylesheetMountProps): ReactNode {
	const bridge = use(StudioEditorBridgeContext);
	if (bridge === null || iframeDoc === undefined) {
		return null;
	}
	return (
		<Suspense fallback={null}>
			<AuthoringStylesheet document={iframeDoc} />
		</Suspense>
	);
}
