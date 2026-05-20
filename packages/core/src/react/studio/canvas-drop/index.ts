/**
 * @file Public surface for sidebar → canvas drag-and-drop replacement.
 *
 * Drag sources (sidebar) import the payload encoder; the canvas wires
 * up {@link CanvasDropMount}. Everything else is internal.
 */

export { CanvasDropMount } from "./CanvasDropMount";
export type { CanvasDropMountProps } from "./CanvasDropMount";
export {
  ANVILKIT_CANVAS_DROP_TYPE,
  type CanvasDropKind,
  type CanvasDropPayload,
  encodeDropPayload,
  hasCanvasDropPayload,
  peekDropKind,
  readDropPayload,
} from "./drag-payload";
export {
  collectStringPaths,
  findImageTargetAt,
  findStringPropPath,
  findTextElementAt,
  findUrlPropPath,
  getAtPath,
  hasReplaceableTarget,
  looksLikeImageUrl,
  normalizeUrl,
  type PropPath,
  setPropAtPath,
} from "./resolve-field-path";
export {
  resolveImageTargetProp,
  resolveTextTargetProp,
} from "./resolve-target-prop";
export {
  DROP_TARGET_ATTR,
  useCanvasDropController,
} from "./useCanvasDropController";
