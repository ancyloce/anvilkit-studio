import { describe, expect, it } from "vitest";

/**
 * Smoke test proving the workspace test pipeline is wired end-to-end.
 *
 * This test asserts nothing meaningful about `@anvilkit/ui` itself — it
 * exists to verify that `@anvilkit/vitest-config` resolves, Vitest boots
 * with the `react-library` preset, and `turbo run test` picks up the
 * package. Replace or delete once real component tests land.
 */
describe("workspace smoke test", () => {
	it("runs Vitest under the @anvilkit/vitest-config react-library preset", () => {
		expect(true).toBe(true);
	});
});
