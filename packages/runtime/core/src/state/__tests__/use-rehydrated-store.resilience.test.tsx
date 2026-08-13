/**
 * @file Regression tests for review 0036 H-1 — the hydration gate must
 * always open.
 *
 * `useRehydratedStore` gates its subtree until a store's persisted slice
 * has rehydrated. zustand signals that through `onFinishHydration`,
 * which fires **only on the success path**: a throwing storage engine
 * lands in persist's trailing `.catch`, and a missing one returns before
 * the chain even starts. Waiting on that signal alone meant three
 * ordinary browser conditions — blocked storage, an unparseable blob, a
 * custom async storage that hangs — left `<Studio>` rendering nothing
 * forever, with no throw, no timeout and no log.
 *
 * These tests pin the bounded behaviour: the gate opens with defaults on
 * every failure path, warns when it does, and is untouched on the happy
 * path.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import {
	HYDRATION_TIMEOUT_MS,
	useRehydratedStore,
} from "@/state/use-rehydrated-store";

/**
 * A persisted store whose storage never settles — the shape a
 * network-backed custom `PersistStorage` degrades to when the request
 * hangs. `getItem` returns a promise that is never resolved or
 * rejected, so neither `onFinishHydration` nor persist's `.catch` ever
 * runs and only the timeout can open the gate.
 */
const hungStore = createStore<{ readonly value: number }>()(
	persist(() => ({ value: 1 }), {
		name: "anvilkit-test-hung",
		skipHydration: true,
		storage: {
			getItem: () =>
				new Promise<never>(() => {
					// Intentionally never settles — that is the condition
					// under test. Only the timeout can open the gate.
				}),
			setItem: () => undefined,
			removeItem: () => undefined,
		},
	}),
);

// Module scope: `create` sits in the hook's `useMemo` deps, so a fresh
// identity per render would re-create the store every render.
const createHungStore = (): typeof hungStore => hungStore;

function HungProbe(): ReactNode {
	const { hydrated } = useRehydratedStore("hung", createHungStore);
	return <div data-testid="probe">{hydrated ? "open" : "gated"}</div>;
}

function gateState(container: HTMLElement): string | undefined {
	return (
		container.querySelector("[data-testid=probe]")?.textContent ?? undefined
	);
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(cleanup);

describe("useRehydratedStore — the gate always opens (0036 H-1)", () => {
	it("opens with defaults when the storage engine throws on read", async () => {
		// Safari private browsing, a sandboxed or third-party-blocked
		// iframe, and enterprise storage policy all surface exactly here.
		const getItem = vi
			.spyOn(Storage.prototype, "getItem")
			.mockImplementation(() => {
				throw new DOMException("The operation is insecure.", "SecurityError");
			});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const { container } = render(
				<EditorStoreProvider storeId="blocked-storage">
					<div data-testid="chrome" />
				</EditorStoreProvider>,
			);

			// Before the fix this never resolved: five slices, each waiting
			// on a success-only signal that could no longer fire.
			await waitFor(() => {
				expect(container.querySelector("[data-testid=chrome]")).not.toBeNull();
			});
			expect(warn).toHaveBeenCalled();
		} finally {
			getItem.mockRestore();
			warn.mockRestore();
		}
	});

	it("opens with defaults when the persisted blob cannot be parsed", async () => {
		const getItem = vi
			.spyOn(Storage.prototype, "getItem")
			.mockReturnValue("{ not json");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const { container } = render(
				<EditorStoreProvider storeId="corrupt-blob">
					<div data-testid="chrome" />
				</EditorStoreProvider>,
			);

			await waitFor(() => {
				expect(container.querySelector("[data-testid=chrome]")).not.toBeNull();
			});
		} finally {
			getItem.mockRestore();
			warn.mockRestore();
		}
	});

	it("opens after the timeout when persist storage never settles", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const { container } = render(<HungProbe />);
			// Flush mount effects and the `rehydrate()` microtask. The
			// storage promise is still pending, so nothing has settled.
			await act(async () => undefined);
			expect(gateState(container)).toBe("gated");

			await act(async () => {
				vi.advanceTimersByTime(HYDRATION_TIMEOUT_MS);
			});
			expect(gateState(container)).toBe("open");
			expect(warn).toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
			warn.mockRestore();
		}
	});

	it("leaves the happy path unchanged and silent", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const { container } = render(
				<EditorStoreProvider storeId="healthy">
					<div data-testid="chrome" />
				</EditorStoreProvider>,
			);

			await waitFor(() => {
				expect(container.querySelector("[data-testid=chrome]")).not.toBeNull();
			});
			// A working storage hydrates through `onFinishHydration`; the
			// failure paths must not fire on it.
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});
