/**
 * @file Regression tests for the review 0036 L-series behavioural fixes.
 *
 * - **L-1** the persisted store is held with a semantic guarantee, not a
 *   `useMemo` React may discard.
 * - **L-8** `useLocalFieldValue` keeps a stable `onInputChange` even when
 *   `parse` is an inline arrow.
 * - **L-9** the key-event shim no longer adds a visible own property to
 *   somebody else's event object.
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyEventGuard } from "@/components/use-key-event-guard";
import { useLocalFieldValue } from "@/overrides/fields/field-types/use-local-field-value";
import { createThemeStore } from "@/state/slices/theme-store";
import { useRehydratedStore } from "@/state/use-rehydrated-store";

afterEach(cleanup);

describe("useRehydratedStore holds one store instance (0036 L-1)", () => {
	it("returns the same store across re-renders", () => {
		const seen: unknown[] = [];
		function Probe({ tick }: { readonly tick: number }): ReactNode {
			const { store } = useRehydratedStore(`l1-${0}`, createThemeStore);
			seen.push(store);
			return <span data-testid={`tick-${tick}`} />;
		}
		const view = render(<Probe tick={0} />);
		view.rerender(<Probe tick={1} />);
		view.rerender(<Probe tick={2} />);
		expect(seen.length).toBeGreaterThan(1);
		expect(new Set(seen).size).toBe(1);
	});

	it("re-keys when storeId changes", () => {
		const seen: unknown[] = [];
		function Probe({ id }: { readonly id: string }): ReactNode {
			const { store } = useRehydratedStore(id, createThemeStore);
			seen.push(store);
			return null;
		}
		const view = render(<Probe id="l1-a" />);
		view.rerender(<Probe id="l1-b" />);
		expect(new Set(seen).size).toBe(2);
	});
});

describe("useLocalFieldValue keeps handlers stable (0036 L-8)", () => {
	it("does not re-create onInputChange for an inline `parse`", () => {
		const handlers: unknown[] = [];
		function Probe({ tick }: { readonly tick: number }): ReactNode {
			const { onInputChange } = useLocalFieldValue(
				"value",
				// Inline on purpose: a fresh identity every render, which is
				// how a consumer naturally writes it.
				(raw: string) => ({ ok: true as const, value: raw }),
				(value: string) => value,
				() => undefined,
			);
			handlers.push(onInputChange);
			return <span data-testid={`t-${tick}`} />;
		}
		const view = render(<Probe tick={0} />);
		view.rerender(<Probe tick={1} />);
		view.rerender(<Probe tick={2} />);
		expect(handlers.length).toBeGreaterThan(1);
		expect(new Set(handlers).size).toBe(1);
	});

	it("still commits through the LATEST parse", () => {
		const committed: string[] = [];
		function Probe({ prefix }: { readonly prefix: string }): ReactNode {
			const { onInputChange } = useLocalFieldValue(
				"",
				(raw: string) => ({ ok: true as const, value: `${prefix}${raw}` }),
				(value: string) => value,
				(value: string) => {
					committed.push(value);
				},
			);
			// Expose the handler for the test to drive.
			(globalThis as { __commit?: (raw: string) => void }).__commit =
				onInputChange;
			return null;
		}
		const view = render(<Probe prefix="a:" />);
		view.rerender(<Probe prefix="b:" />);
		act(() => {
			(globalThis as { __commit?: (raw: string) => void }).__commit?.("x");
		});
		// Stability must not mean staleness — the ref-boxed `parse` is the
		// newest one.
		expect(committed).toEqual(["b:x"]);
	});
});

describe("useKeyEventGuard shims unobtrusively (0036 L-9)", () => {
	it("adds getModifierState without making it an enumerable own key", () => {
		function Probe(): ReactNode {
			useKeyEventGuard();
			return null;
		}
		render(<Probe />);

		// A plain `Event`, as a password manager or autofill extension
		// dispatches — no `getModifierState` on the prototype.
		const event = new Event("keydown", { bubbles: true });
		document.body.dispatchEvent(event);

		const patched = event as Event & Partial<KeyboardEvent>;
		expect(typeof patched.getModifierState).toBe("function");
		expect(patched.getModifierState?.("AltGraph")).toBe(false);
		// The shim must not surface as part of the event.
		expect(Object.keys(event)).not.toContain("getModifierState");
		expect(
			Object.getOwnPropertyDescriptor(event, "getModifierState")?.enumerable,
		).toBe(false);
	});

	it("leaves a real KeyboardEvent untouched", () => {
		function Probe(): ReactNode {
			useKeyEventGuard();
			return null;
		}
		render(<Probe />);
		const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
		document.body.dispatchEvent(event);
		// Still the prototype's, not an own property.
		expect(
			Object.getOwnPropertyDescriptor(event, "getModifierState"),
		).toBeUndefined();
	});
});
