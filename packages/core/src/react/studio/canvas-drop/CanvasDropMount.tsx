/**
 * @file Headless mount point for the canvas drop controller.
 *
 * Rendered by the `CanvasIframe` override alongside Puck's iframe
 * children so the controller can bind to the live iframe `Document`
 * without changing `CanvasIframe`'s existing effect/observer code.
 * Renders nothing.
 */

import type { ReactNode } from "react";
import { useCanvasDropController } from "./useCanvasDropController";

export interface CanvasDropMountProps {
	readonly document?: Document;
}

export function CanvasDropMount({
	document: iframeDoc,
}: CanvasDropMountProps): ReactNode {
	useCanvasDropController(iframeDoc);
	return null;
}
