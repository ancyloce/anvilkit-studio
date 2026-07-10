/**
 * Compatibility smoke for the public `@anvilkit/*` package surface.
 *
 * Three routes, three claims:
 *   `/`       — the app shell server-renders with zero client JS.
 *   `/render` — `<Render>` from `@puckeditor/core/rsc` serves the Hero
 *               component's content via SSR (visible without hydration).
 *   `/editor` — `<Studio>` from `@anvilkit/core` mounts from built public
 *               exports and lists the Hero component in its insert sidebar.
 *
 * Every test collects `pageerror` events and asserts none fired, so a
 * package that renders but throws during hydration still fails here.
 */

import { expect, type Page, test } from "@playwright/test";

function collectPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(err.stack ?? err.message));
	return errors;
}

test.describe("playground compatibility smoke", () => {
	test("index server-renders with links to both surfaces", async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto("/");

		await expect(
			page.getByRole("heading", { name: "AnvilKit Playground" }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: "/editor" })).toBeVisible();
		await expect(page.getByRole("link", { name: "/render" })).toBeVisible();

		expect(errors).toEqual([]);
	});

	test("/render serves the Hero component through the RSC render path", async ({
		page,
	}) => {
		const errors = collectPageErrors(page);

		await page.goto("/render");

		// Hero's default headline, server-rendered — visible without any
		// client-side editor runtime.
		await expect(page.getByText("Write fast with").first()).toBeVisible();

		expect(errors).toEqual([]);
	});

	test("/editor mounts <Studio> and exposes the Hero component", async ({
		page,
	}) => {
		const errors = collectPageErrors(page);

		await page.goto("/editor");

		await expect(page.getByTestId("playground-editor")).toBeVisible({
			timeout: 30_000,
		});

		// The Studio insert sidebar lists the single configured component
		// once the editor runtime has compiled and mounted.
		await expect(page.getByText("Hero", { exact: true }).first()).toBeAttached({
			timeout: 30_000,
		});

		expect(errors).toEqual([]);
	});
});
