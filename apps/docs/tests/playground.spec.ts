/**
 * Playground smoke test — ported from apps/docs for the Fumadocs/TanStack
 * Start app. Mounts /playground (client-only Puck island), asserts all 11
 * components show in the palette, drives the HTML export, runs the mock AI
 * generation, and confirms the localStorage round-trip survives a reload.
 */
import { expect, test } from "@playwright/test";

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
		page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message));

		await page.goto("/playground");

		await expect(page.getByTestId("playground-root")).toBeVisible({
			timeout: 30_000,
		});

		const canvas = page.locator(".anvilkit-playground__canvas");
		await expect(canvas).toBeVisible();

		for (const label of EXPECTED_COMPONENT_LABELS) {
			await expect(
				canvas.getByText(label, { exact: true }).first(),
			).toBeAttached({ timeout: 15_000 });
		}

		// Export HTML — Playwright auto-accepts the download.
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

		// Flip the AI toggle and run a mock generation.
		const aiToggle = page.getByTestId("playground-ai-toggle");
		await aiToggle.evaluate((node: HTMLInputElement) => node.click());
		await expect(aiToggle).toBeChecked();
		await expect(page.getByTestId("playground-ai-prompt")).toBeVisible();
		await page.getByTestId("playground-ai-generate").click({ force: true });
		await expect(page.getByTestId("playground-ai-generate")).toHaveText(
			/generate fixture/i,
			{ timeout: 15_000 },
		);

		// LocalStorage round-trip: reload and assert the draft key survives.
		await page.reload();
		await expect(page.getByTestId("playground-root")).toBeVisible({
			timeout: 30_000,
		});
		const storedDraft = await page.evaluate(() =>
			window.localStorage.getItem("anvilkit-playground-data-v1"),
		);
		expect(storedDraft).not.toBeNull();
		expect((storedDraft ?? "").length).toBeGreaterThan(0);

		expect(pageErrors, pageErrors.join("\n---\n")).toEqual([]);
	});
});
