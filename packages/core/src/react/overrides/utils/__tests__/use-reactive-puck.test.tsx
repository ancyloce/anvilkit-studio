/**
 * @file Regression test for the `useReactivePuck` module-singleton.
 *
 * Two invariants the lazy-singleton must hold:
 *  1. `createUsePuck()` is constructed **exactly once** — the hook
 *     identity is stable across renders and across logically separate
 *     `useReactivePuck` call sites (Rules of Hooks; also the property
 *     the `as unknown as` removal must not regress).
 *  2. The selector is **re-evaluated every render** and re-runs when
 *     the subscribed Puck slice changes (it is a reactive selector,
 *     not a one-shot snapshot read).
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let value = 0;
const listeners = new Set<() => void>();
const createUsePuckSpy = vi.fn();

vi.mock("@puckeditor/core", () => ({
  useGetPuck: () => () => ({ value }),
  createUsePuck: () => {
    createUsePuckSpy();
    return <T,>(selector: (s: { value: number }) => T): T =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => selector({ value }),
        () => selector({ value }),
      );
  },
}));

function bump(): void {
  value += 1;
  for (const l of listeners) l();
}

afterEach(() => {
  cleanup();
  value = 0;
  listeners.clear();
  createUsePuckSpy.mockClear();
});

describe("useReactivePuck", () => {
  it("constructs the underlying hook exactly once across renders and call sites", async () => {
    const { useReactivePuck } = await import("../use-reactive-puck");

    const a = renderHook(() => useReactivePuck((s) => s.value));
    a.rerender();
    a.rerender();
    // A second, independent call site must reuse the same singleton.
    const b = renderHook(() => useReactivePuck((s) => s.value));
    b.rerender();

    expect(createUsePuckSpy).toHaveBeenCalledTimes(1);
  });

  it("re-evaluates the selector when the subscribed slice changes", async () => {
    const { useReactivePuck } = await import("../use-reactive-puck");

    const selector = vi.fn((s: { value: number }) => s.value);
    const { result } = renderHook(() => useReactivePuck(selector));

    expect(result.current).toBe(0);
    const callsAfterMount = selector.mock.calls.length;

    act(() => {
      bump();
    });

    expect(result.current).toBe(1);
    // Selector ran again for the new state — it is reactive, not a
    // frozen snapshot.
    expect(selector.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
