/**
 * @file `CanvasPreview` — Puck `preview` override.
 *
 * Transparent pass-through to Puck's preview surface. The viewport
 * chrome (panel-tinted backdrop, padding, scroll, sized canvas page)
 * is owned by `<StudioViewportPreview>`; rendering anything here
 * would nest a second scroll/padding context inside the canvas page.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode } from "react";

export function CanvasPreview(): ReactNode {
  return <Puck.Preview />;
}
