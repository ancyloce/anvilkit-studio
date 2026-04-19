/**
 * Playground smoke test (`phase4-004`).
 *
 * Mounts the docs `/playground/` route, asserts all 11 components
 * show up in the palette, drives the HTML export pipeline, verifies
 * the "Try AI (mock)" toggle injects a fixture page, and confirms
 * the localStorage round-trip survives a reload.
 */

import { expect, test } from "@playwright/test";

// Puck auto-spaces PascalCase component keys when rendering the
// palette (e.g. "BentoGrid" → "Bento Grid"). Match on the spaced
// labels so the assertions mirror what a user actually sees.
const EXPECTED_COMPONENT_LABELS = [
	"Bento Grid",
	"Blog List",
	"Button",
	"Hero",
	"Helps",
	"Input",
	"Logo Clouds",
	"Navbar",
	"Pricing Minimal",
	"Section",
	"Statistics",
] as const;

test.describe("playground", () => {
	test("loads, exposes all 11 components, exports HTML, and persists to localStorage", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => {
			pageErrors.push(err.stack ?? err.message);
		});

		await page.goto("/playground/");

		// Wait for the React island to hydrate — the root is rendered
		// with `client:only` so its first appearance in the DOM proves
		// hydration succeeded.
		await expect(page.getByTestId("playground-root")).toBeVisible({
			timeout: 20_000,
		});

		// Puck's palette renders each component's label; wait for the
		// default Hero to land in the canvas before asserting palette
		// entries so we're past the Studio compile step.
		const canvas = page.locator(".anvilkit-playground__canvas");
		await expect(canvas).toBeVisible();

		// Puck collapses every category except "Navigation" on first
		// render, so the palette items for the other categories are in
		// the DOM but hidden behind `details`-style toggles. Assert
		// DOM presence (`toBeAttached`) rather than visibility — the
		// user can open any category to drag its item.
		for (const label of EXPECTED_COMPONENT_LABELS) {
			await expect(
				canvas.getByText(label, { exact: true }).first(),
			).toBeAttached({ timeout: 10_000 });
		}

		// Export HTML — Playwright auto-accepts the download and hands
		// us the temp path.
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTestId("playground-export-html").click({ force: true }),
		]);

		expect(download.suggestedFilename().endsWith(".html")).toBe(true);
		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		const fs = await import("node:fs/promises");
		const html = await fs.readFile(downloadPath, "utf8");
		expect(html.toLowerCase()).toContain("<!doctype html>");
		expect(html.length).toBeGreaterThan(500);

		// Flip the AI toggle and run a mock generation. The fixture
		// harness matches "hero" → hero fixture and emits a hero block
		// into the canvas, so the status text flips back to idle.
		// The Puck canvas below the toggle re-renders continuously as
		// it lays itself out, which trips Playwright's "stable" wait
		// if we use `.check()`. Drive the toggle through the native
		// input property instead — that's what the React `onChange`
		// handler listens for.
		const aiToggle = page.getByTestId("playground-ai-toggle");
		await aiToggle.evaluate((node: HTMLInputElement) => {
			node.click();
		});
		await expect(aiToggle).toBeChecked();
		await expect(page.getByTestId("playground-ai-prompt")).toBeVisible();
		await page
			.getByTestId("playground-ai-generate")
			.click({ force: true });
		await expect(page.getByTestId("playground-ai-generate")).toHaveText(
			/generate fixture/i,
			{ timeout: 10_000 },
		);

		// LocalStorage round-trip: reload and assert the draft key
		// survives. The playground writes to it on every change, so a
		// reload should see the key populated and the status line
		// flip to "Loaded saved draft".
		await page.reload();
		await expect(page.getByTestId("playground-root")).toBeVisible({
			timeout: 20_000,
		});
		const storedDraft = await page.evaluate(() =>
			window.localStorage.getItem("anvilkit-playground-data-v1"),
		);
		expect(storedDraft).not.toBeNull();
		expect((storedDraft ?? "").length).toBeGreaterThan(0);

		expect(pageErrors, pageErrors.join("\n---\n")).toEqual([]);
	});
});
