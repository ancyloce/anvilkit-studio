/**
 * `?editor=1` must load with a clean console.
 *
 * ### The regression this guards
 *
 * Loading `/puck/editor?editor=1` crashed with
 * "Maximum update depth exceeded" from `usePreviewSession`. The hook
 * used two effects; the replacing one returned `() => next.dispose()`,
 * which disposed the session it had just installed — so the
 * `!session.disposed` guard failed against its own replacement and it
 * created a new session forever. React StrictMode (Next dev) triggered
 * it on mount with no preview toggle at all.
 *
 * Unit coverage lives in
 * `packages/runtime/core/src/react/editor/__tests__/use-preview-session.test.tsx`
 * (the buggy version hangs the runner outright). This spec is the
 * product-level guard: whatever the cause, the flagged route must not
 * spew console errors or page errors on a plain load.
 *
 * Deliberately broad — it asserts on the *console*, not on one message
 * — because the class of bug it protects against (a render loop, an
 * unhandled rejection during mount, a missing provider) always shows
 * up there first.
 */

import { expect, test } from "@playwright/test";

/** Noise from the dev harness that is not an app defect. */
const IGNORED = [
	/Download the React DevTools/i,
	/\[Fast Refresh\]/i,
	/Extra attributes from the server/i,
	/webpack-hmr|hot-update/i,
	// Third-party asset fetches the demo makes against the network,
	// which is not what this spec is about.
	/Failed to load resource/i,
];

test.describe("?editor=1 loads cleanly", () => {
	test.describe.configure({ timeout: 240_000 });

	test("no console errors and no page errors on mount", async ({ page }) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		page.on("console", (message) => {
			if (message.type() !== "error") return;
			const text = message.text();
			if (IGNORED.some((pattern) => pattern.test(text))) return;
			consoleErrors.push(text);
		});
		page.on("pageerror", (error) => pageErrors.push(String(error)));

		await page.goto("/puck/editor?editor=1&collab=0");

		// The editor chrome actually mounted — otherwise "no errors" would
		// be trivially true for a page that rendered nothing.
		await expect(page.getByTestId("ak-write-target")).toBeVisible({
			timeout: 120_000,
		});

		// Give the render loop a chance to manifest: the old bug produced
		// its overflow within a few hundred ms of mount.
		await page.waitForTimeout(3_000);

		expect(
			consoleErrors.join("\n---\n"),
			"the flagged editor route must mount without console errors",
		).toBe("");
		expect(pageErrors.join("\n---\n")).toBe("");
	});

	test("specifically: no update-depth overflow from the preview session", async ({
		page,
	}) => {
		const overflow: string[] = [];
		page.on("console", (message) => {
			if (/Maximum update depth exceeded/i.test(message.text())) {
				overflow.push(message.text());
			}
		});
		page.on("pageerror", (error) => {
			if (/Maximum update depth exceeded/i.test(String(error))) {
				overflow.push(String(error));
			}
		});

		await page.goto("/puck/editor?editor=1&collab=0");
		await expect(page.getByTestId("ak-write-target")).toBeVisible({
			timeout: 120_000,
		});
		await page.waitForTimeout(3_000);

		expect(overflow).toEqual([]);
	});
});
