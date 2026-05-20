/**
 * @file Pure clamping math for the floating action bar.
 *
 * The action bar pins to the top-right of the currently selected
 * component. At extreme zoom or near the canvas edges the bar can
 * overshoot the viewport — this module computes the clamped
 * `(x, y)` coordinates so the bar always stays fully visible.
 *
 * Pure and side-effect-free so it can be unit-tested without a DOM.
 * Phase 3's `ActionBar` override consumes the output.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ActionBarLayout {
  readonly x: number;
  readonly y: number;
}

export interface ComputeActionBarPositionInput {
  readonly target: Rect;
  readonly viewport: Rect;
  readonly bar: { readonly width: number; readonly height: number };
  readonly zoom: number;
  readonly margin?: number;
}

/**
 * Compute the clamped top-right anchor for the action bar.
 *
 * - Anchors to the top-right corner of `target`, offset by `bar.height`
 *   above the target so the bar floats over the component's outline.
 * - Divides offsets by `zoom` so the bar stays the same on-screen size
 *   regardless of canvas scale.
 * - Clamps to `viewport` minus `margin` so the bar never sits flush
 *   against the canvas edge.
 */
export function computeActionBarPosition(
  input: ComputeActionBarPositionInput,
): ActionBarLayout {
  const { target, viewport, bar, zoom, margin = 4 } = input;
  const safeZoom = zoom <= 0 ? 1 : zoom;

  const desiredX = target.x + target.width - bar.width / safeZoom;
  const desiredY = target.y - (bar.height + margin) / safeZoom;

  const minX = viewport.x + margin;
  const maxX = viewport.x + viewport.width - bar.width - margin;
  const minY = viewport.y + margin;
  const maxY = viewport.y + viewport.height - bar.height - margin;

  return {
    x: clamp(desiredX, minX, maxX),
    y: clamp(desiredY, minY, maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
