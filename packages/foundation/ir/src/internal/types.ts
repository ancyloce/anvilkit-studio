/**
 * Shared internal type/constant helpers for `@anvilkit/ir`.
 *
 * @internal — not part of the public `@anvilkit/ir` surface.
 */

/** Strips `readonly` from every property of `T`. */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Maximum tree/value recursion depth honoured by every recursive
 * walker in this package. The IR is a tree of authored components;
 * real pages are shallow, so this only trips on pathological or
 * generated input. Walkers stop descending past this depth instead
 * of overflowing the stack — surfacing an `ExportWarning` where an
 * `onWarning` channel is available.
 */
export const MAX_TREE_DEPTH = 512;
