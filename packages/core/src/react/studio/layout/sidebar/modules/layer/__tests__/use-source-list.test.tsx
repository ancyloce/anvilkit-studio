/**
 * @file Tests for {@link useSourceList} — the shared async source-list
 * subscription hook. The headline guarantee is out-of-order
 * protection: a slow initial `list()` resolving *after* a fast
 * subscription-driven refresh must not clobber the fresher data.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ListSource, useSourceList } from "../use-source-list";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useSourceList", () => {
  it("yields empty, non-error, non-loading when no source", () => {
    const { result } = renderHook(() => useSourceList<number>(undefined));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("resolves the initial list and clears loading", async () => {
    const source: ListSource<string> = { list: () => ["a", "b"] };
    const { result } = renderHook(() => useSourceList<string>(source));
    await waitFor(() => expect(result.current.items).toEqual(["a", "b"]));
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("surfaces an error when list() rejects", async () => {
    const source: ListSource<string> = {
      list: () => Promise.reject(new Error("boom")),
    };
    const { result } = renderHook(() => useSourceList<string>(source));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.items).toEqual([]);
  });

  it("drops a stale initial list() that resolves after a refresh", async () => {
    // Initial list() is slow; a subscription refresh fires and its
    // (fresh) list() resolves first. The slow initial resolution must
    // be discarded, not overwrite the newer data.
    const slow = deferred<readonly string[]>();
    let listener: (() => void) | undefined;
    let call = 0;

    const source: ListSource<string> = {
      list: () => {
        call += 1;
        if (call === 1) return slow.promise; // initial — slow
        return ["fresh"]; // refresh — fast (sync)
      },
      subscribe: (cb) => {
        listener = cb;
        return () => {
          listener = undefined;
        };
      },
    };

    const { result } = renderHook(() => useSourceList<string>(source));

    // Fire a subscription refresh before the initial list resolves.
    await act(async () => {
      listener?.();
    });
    await waitFor(() => expect(result.current.items).toEqual(["fresh"]));

    // Now the stale initial list resolves — must be ignored.
    await act(async () => {
      slow.resolve(["stale"]);
    });
    expect(result.current.items).toEqual(["fresh"]);
    expect(result.current.error).toBe(false);
  });

  it("unsubscribes and ignores late resolutions after unmount", async () => {
    const slow = deferred<readonly string[]>();
    const unsubscribe = vi.fn();
    const source: ListSource<string> = {
      list: () => slow.promise,
      subscribe: () => unsubscribe,
    };

    const { result, unmount } = renderHook(() => useSourceList<string>(source));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      slow.resolve(["late"]);
    });
    // State frozen at its pre-unmount value (no post-unmount write).
    expect(result.current.items).toEqual([]);
  });
});
