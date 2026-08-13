/**
 * @file Regression tests for review 0036 L-2 — `useOptionalReactivePuck`
 * must degrade on a MISSING provider and on nothing else.
 *
 * The hook wraps Puck's `createUsePuck()` in a `try/catch` so a
 * component that production always mounts inside `<Puck>`, but a unit
 * test mounts bare, degrades to a fallback instead of crashing. The
 * catch was untyped, so it also swallowed a bug INSIDE the selector —
 * which runs after zustand's `useSyncExternalStore` and therefore lands
 * in the same catch. The UI then showed the fallback forever with
 * nothing logged anywhere.
 *
 * Reaching the selector at all requires a provider to be present, so
 * Puck is mocked here: rendering bare would throw from `useContext`
 * first and the selector would never execute — which is exactly why the
 * first draft of this test passed against the unfixed code.
 */

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOptionalReactivePuck } from "../use-reactive-puck.js";

const puck = vi.hoisted(() => ({ providerPresent: true }));

vi.mock("@puckeditor/core", () => ({
	createUsePuck: () => (selector: (snapshot: unknown) => unknown) => {
		if (!puck.providerPresent) {
			// Puck's own message, thrown from its first `useContext`.
			throw new Error("usePuck must be used inside <Puck>.");
		}
		return selector({ appState: { data: null }, config: {} });
	},
	useGetPuck: () => () => ({ appState: { data: null } }),
}));

afterEach(cleanup);

describe("useOptionalReactivePuck (0036 L-2)", () => {
	it("falls back when the provider is absent", () => {
		puck.providerPresent = false;
		let value: string | undefined;
		function Probe(): ReactNode {
			value = useOptionalReactivePuck(() => "live", "fallback");
			return null;
		}
		render(<Probe />);
		expect(value).toBe("fallback");
	});

	it("returns the selected value when the provider is present", () => {
		puck.providerPresent = true;
		let value: string | undefined;
		function Probe(): ReactNode {
			value = useOptionalReactivePuck(() => "live", "fallback");
			return null;
		}
		render(<Probe />);
		expect(value).toBe("live");
	});

	it("re-throws a failure from inside the selector", () => {
		puck.providerPresent = true;
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		try {
			function Probe(): ReactNode {
				useOptionalReactivePuck(() => {
					throw new Error("selector blew up");
				}, "fallback");
				return null;
			}
			// Before the fix this was indistinguishable from absence: the
			// component silently rendered `fallback` forever.
			expect(() => render(<Probe />)).toThrow("selector blew up");
		} finally {
			consoleError.mockRestore();
		}
	});
});
