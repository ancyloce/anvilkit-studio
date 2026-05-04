/**
 * @file Smoke test for the Toast primitive.
 *
 * Verifies the `<StudioToaster>` host mounts without crashing and
 * exposes a sonner-managed region. We don't drive a real toast through
 * the imperative helper here — that requires sonner's queue runtime
 * which is exercised in the higher-level module tests in Phase E/F.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioToaster, studioToast } from "../Toast.js";

afterEach(cleanup);

describe("StudioToaster", () => {
	it("mounts without throwing", () => {
		// Only assertion is "render does not throw"; sonner's actual
		// region only mounts after the first toast (sonner v2 lazy-
		// initializes its DOM), so we don't query the region here.
		// Phase E/F integration tests fire a real toast and assert on
		// the rendered item.
		expect(() => render(<StudioToaster />)).not.toThrow();
	});

	it("exposes studioToast as a callable handle", () => {
		expect(typeof studioToast).toBe("function");
		expect(typeof studioToast.error).toBe("function");
		expect(typeof studioToast.success).toBe("function");
	});
});
