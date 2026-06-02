/**
 * @file Phase 3 / T9.2 — Unsplash source tab (mocked).
 *
 * Runs against the demo with `NEXT_PUBLIC_UNSPLASH_ENABLED=1` (the dev server
 * must be started with that env var — the Playwright webServer reuses an
 * existing :3000 server, so start it manually first). All Unsplash network is
 * mocked via Playwright routing, so no real key is needed:
 *   - `/api/unsplash/**`  (the demo's proxy) → fixture search / topic results
 *   - `api.unsplash.com/**download**`        → the MANDATORY download trigger
 *   - `images.unsplash.com/**`               → a 1×1 PNG so tiles render
 *
 * Verifies: source tabs appear → switch to Unsplash → theme chips + result
 * tiles with attribution → click a tile fires the download trigger and inserts
 * an `asset://unsplash:` reference.
 */

import { expect, type Page, test } from "@playwright/test";

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==",
	"base64",
);

const PHOTO = {
	id: "p1",
	width: 4000,
	height: 3000,
	description: "A mountain",
	urls: {
		regular: "https://images.unsplash.com/photo-1?ixid=abc",
		small: "https://images.unsplash.com/photo-1-small",
		thumb: "https://images.unsplash.com/photo-1-thumb",
	},
	links: {
		html: "https://unsplash.com/photos/p1",
		download_location: "https://api.unsplash.com/photos/p1/download?ixid=abc",
	},
	user: { name: "Jane Doe", links: { html: "https://unsplash.com/@jane" } },
};

const TOPIC = { id: "nature", slug: "nature", title: "Nature" };

async function activateImageModule(page: Page) {
	await page.goto("/puck/editor?e2e=puck-drag");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });
	await page.locator("#ak-rail-tab-image").click();
	await expect(page.getByTestId("ak-module-image")).toBeVisible({
		timeout: 5_000,
	});
}

test("Unsplash: enable → search → insert fires the download trigger", async ({
	page,
}) => {
	test.setTimeout(90_000);

	let downloadTriggered = false;

	// The demo's server proxy — return fixture search / topic results.
	await page.route("**/api/unsplash/**", async (route) => {
		const url = route.request().url();
		if (url.includes("/search/photos")) {
			await route.fulfill({ json: { total: 1, results: [PHOTO] } });
		} else if (url.includes("/topics/") && url.includes("/photos")) {
			await route.fulfill({ json: [PHOTO] });
		} else if (url.includes("/topics")) {
			await route.fulfill({ json: [TOPIC] });
		} else if (url.includes("/photos/")) {
			await route.fulfill({ json: PHOTO });
		} else {
			await route.fulfill({ json: {} });
		}
	});
	// The MANDATORY download trigger hits the absolute `download_location`.
	await page.route("**://api.unsplash.com/**download**", async (route) => {
		downloadTriggered = true;
		await route.fulfill({
			json: { url: "https://images.unsplash.com/photo-1?dl" },
		});
	});
	// Hotlinked thumbnails — serve a real pixel so tiles render.
	await page.route("**://images.unsplash.com/**", async (route) => {
		await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
	});

	await activateImageModule(page);

	// Source tabs appear only when Unsplash is enabled. Skip cleanly otherwise
	// so the spec is safe in a default `pnpm dev` (no flag) CI run; it executes
	// when the dev server is started with NEXT_PUBLIC_UNSPLASH_ENABLED=1.
	const tabs = page.getByTestId("ak-image-source-tabs");
	const enabled = await tabs
		.waitFor({ state: "visible", timeout: 15_000 })
		.then(() => true)
		.catch(() => false);
	test.skip(
		!enabled,
		"Unsplash disabled (set NEXT_PUBLIC_UNSPLASH_ENABLED=1).",
	);
	await expect(tabs).toBeVisible();

	// Switch to the Unsplash tab → theme chips + a results query fire.
	await tabs.getByRole("button", { name: /unsplash/i }).click();
	await expect(page.getByTestId("ak-image-theme-chips")).toBeVisible({
		timeout: 10_000,
	});

	// A result tile renders, carrying the required attribution credit.
	const tile = page
		.getByTestId("ak-image-section-images")
		.locator('[data-testid^="ak-image-tile-"]')
		.first();
	await expect(tile).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("ak-image-attribution").first()).toBeVisible();

	// Insert it: pickResult registers the asset, fires the download trigger,
	// and dispatches an `asset://unsplash:` reference into the page.
	await tile.locator("button").first().click();

	await expect.poll(() => downloadTriggered, { timeout: 10_000 }).toBe(true);

	// Publish and confirm the inserted Unsplash reference reached the document.
	await page
		.getByRole("button", { name: "Publish", exact: true })
		.click({ force: true });
	await page
		.getByRole("button", { name: "Publish to live" })
		.click({ force: true });
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const w = window as unknown as { __puckData?: unknown };
					return w.__puckData ? JSON.stringify(w.__puckData) : "";
				}),
			{ timeout: 10_000 },
		)
		.toMatch(/"asset:\/\/unsplash:/);
});
