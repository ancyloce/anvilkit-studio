/**
 * @file Shared async source-list subscription with request sequencing.
 *
 * Extracted from the byte-identical effects in {@link PagesPanel} and
 * {@link LayersPanel}. Beyond de-duplication it fixes an ordering bug
 * the original `cancelled`-flag effect could not: a slow initial
 * `list()` resolving *after* a fast `subscribe()`-driven refresh would
 * clobber the fresher data with stale. A monotonic generation counter
 * guarantees only the latest in-flight `list()` may write state
 * (review §3/§4 — CMS source async races).
 */

import { useEffect, useState } from "react";

/** Minimal contract a source must satisfy to be listed + subscribed. */
export interface ListSource<T> {
  /** Return the current list. May be sync or async. */
  list(): readonly T[] | Promise<readonly T[]>;
  /**
   * Optional: register a listener re-run whenever the source changes.
   * Returns an unsubscribe cleanup.
   */
  subscribe?(listener: () => void): (() => void) | void;
}

export interface SourceListResult<T> {
  readonly items: readonly T[];
  /** `true` while a request is in flight (exposed for symmetry; the
   * pages/layers panels intentionally ignore it). */
  readonly loading: boolean;
  /** `true` when the most recent `list()` rejected. */
  readonly error: boolean;
}

/**
 * Subscribe to an async list source with out-of-order protection.
 *
 * @param source the list source, or `undefined` when none is
 *   registered (yields an empty, non-error, non-loading result).
 */
export function useSourceList<T>(
  source: ListSource<T> | undefined,
): SourceListResult<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (source === undefined) {
      setItems([]);
      setError(false);
      setLoading(false);
      return;
    }
    // Generation counter shared across the initial fetch and every
    // subscription-driven refresh: a newer request bumps it, so any
    // older resolution is dropped instead of overwriting fresher data.
    let seq = 0;
    const refresh = (): void => {
      const mySeq = ++seq;
      setLoading(true);
      void (async () => {
        try {
          const next = await Promise.resolve(source.list());
          if (mySeq !== seq) return;
          setItems(next);
          setError(false);
        } catch {
          if (mySeq !== seq) return;
          setItems([]);
          setError(true);
        } finally {
          if (mySeq === seq) setLoading(false);
        }
      })();
    };
    refresh();
    const unsubscribe = source.subscribe?.(refresh);
    return () => {
      // Invalidate every in-flight request on unmount / source change.
      seq++;
      unsubscribe?.();
    };
  }, [source]);

  return { items, loading, error };
}
