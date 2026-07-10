/**
 * @file Phase 3 / T9.2 — folder management in the live Images rail.
 *
 * Drives the SAME path a real user takes against the default demo
 * (`createAssetManagerPlugin({ uploader })`, no `folders: false`, so the
 * plugin lazily swaps in the folder-aware composite source — see
 * plugin.ts `needsRichSource`). No Unsplash credentials are required: this
 * exercises the in-memory folder store surfaced by the core `ImageModule`
 * `FolderNav`.
 *
 *   1. Activate the sidebar's image module and wait for the rich source.
 *   2. Create a root folder → it appears in the folder list.
 *   3. Navigate into it → the breadcrumb updates (aria-current).
 *   4. Create a NESTED folder inside it → deep-nest breadcrumb.
 *   5. Navigate back up via a breadcrumb crumb → the child folder persists
 *      across navigation (page-lifetime in-memory store; NOT a reload test).
 */

import { expect, type Page, test } from "@playwright/test";

const RAIL_TAB_IMAGE = "ak-rail-tab-image";
const MODULE_TESTID_IMAGE = "ak-module-image";
const FOLDER_NAV = "ak-image-folder-nav";
const NEW_FOLDER_BUTTON = "ak-image-new-folder";
const NEW_FOLDER_INPUT = "ak-image-new-folder-input";
const FOLDER_LIST = "ak-image-folder-list";

async function gotoEditor(page: Page) {
	const consoleMessages: string[] = [];
	const pageErrors: string[] = [];
	page.on("console", (msg) =>
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`),
	);
	page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message));

	await page.goto("/puck/editor?e2e=puck-drag");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });

	return { consoleMessages, pageErrors };
}

async function activateImageModule(page: Page) {
	await page.locator(`#${RAIL_TAB_IMAGE}`).click();
	await expect(page.getByTestId(MODULE_TESTID_IMAGE)).toBeVisible({
		timeout: 5_000,
	});
}

/** Create a folder via the FolderNav affordance (scoped to the current folder). */
async function createFolder(page: Page, name: string) {
	await page.getByTestId(NEW_FOLDER_BUTTON).click();
	const input = page.getByTestId(NEW_FOLDER_INPUT);
	await expect(input).toBeVisible({ timeout: 5_000 });
	await input.fill(name);
	await input.press("Enter");
}

test("Folders: create at root, nest, and navigate via the breadcrumb", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await gotoEditor(page);
	await activateImageModule(page);

	// The FolderNav only renders once the lazy folder-aware composite source
	// has been registered (createFolder !== undefined). Wait for the swap.
	const nav = page.getByTestId(FOLDER_NAV);
	await expect(nav).toBeVisible({ timeout: 15_000 });

	// Step 1 — create a root folder; it shows in the (now non-empty) list.
	await createFolder(page, "Marketing");
	const marketing = page
		.getByTestId(FOLDER_LIST)
		.getByRole("button", { name: /Marketing/ });
	await expect(marketing).toBeVisible({ timeout: 5_000 });

	// Step 2 — navigate into it; the breadcrumb gains a "Marketing" crumb
	// marked as the current page.
	await marketing.click();
	const marketingCrumb = nav.locator("[data-folder-crumb]", {
		hasText: "Marketing",
	});
	await expect(marketingCrumb).toHaveAttribute("aria-current", "page", {
		timeout: 5_000,
	});

	// Step 3 — create a nested folder INSIDE Marketing (scoped create).
	await createFolder(page, "Q3");
	const q3 = page.getByTestId(FOLDER_LIST).getByRole("button", { name: /Q3/ });
	await expect(q3).toBeVisible({ timeout: 5_000 });

	// Step 4 — navigate into Q3 → deep breadcrumb All assets › Marketing › Q3.
	await q3.click();
	await expect(
		nav.locator("[data-folder-crumb]", { hasText: "Q3" }),
	).toHaveAttribute("aria-current", "page", { timeout: 5_000 });
	await expect(nav.locator('[data-folder-crumb="root"]')).toBeVisible();

	// Step 5 — navigate back up by clicking the "Marketing" crumb; Q3 (its
	// child) is still listed, proving membership persists across navigation.
	await nav.locator("[data-folder-crumb]", { hasText: "Marketing" }).click();
	await expect(
		page.getByTestId(FOLDER_LIST).getByRole("button", { name: /Q3/ }),
	).toBeVisible({ timeout: 5_000 });
});
