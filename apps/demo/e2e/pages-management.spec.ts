/**
 * @file Plan 0004 P6 — End-to-end coverage for the Pages panel.
 *
 * Each `test()` exercises one capability surface added across plan
 * phases P2–P5 (rename / duplicate / delete / search / locked / drag-
 * reorder) plus the new P6 demo wiring in
 * `apps/demo/lib/demo-pages-source.ts`. Conventions match
 * `sidebar-modules.spec.ts`: console/pageerror/requestfailed listeners
 * attach before navigation; the rail tablist is the hydration signal.
 *
 * Tests share helpers but each gets a fresh `page` (and therefore a
 * fresh in-memory `createDemoPagesSource()` instance), so ordering
 * does not matter.
 */

import { expect, type Page, test } from "@playwright/test";

const LAYER_RAIL_TAB_ID = "ak-rail-tab-layer";
const LAYER_MODULE_TESTID = "ak-module-layer";

const SEARCH_TESTID = "ak-layer-pages-search";
const SEARCH_EMPTY_TESTID = "ak-layer-pages-search-empty";
const ADD_BUTTON_TESTID = "ak-layer-pages-add";

const row = (id: string): string => `ak-layer-page-row-${id}`;
const menuTrigger = (id: string): string => `${row(id)}-menu`;
const menuItem = (
	id: string,
	action: "rename" | "duplicate" | "settings" | "delete",
): string => `${row(id)}-menu-${action}`;
const renameInput = (id: string): string => `${row(id)}-rename-input`;
const dragHandle = (id: string): string => `${row(id)}-drag-handle`;
const deleteConfirm = (id: string): string =>
	`ak-layer-page-delete-dialog-${id}-confirm`;

async function gotoEditor(
	page: Page,
): Promise<{ console: string[]; pageErrors: string[]; failed: string[] }> {
	const consoleMessages: string[] = [];
	const pageErrors: string[] = [];
	const failed: string[] = [];

	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});
	page.on("pageerror", (err) => {
		pageErrors.push(err.stack ?? err.message);
	});
	page.on("requestfailed", (req) => {
		failed.push(
			`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`,
		);
	});

	// `?e2e=demo-tools` surfaces the published-data snapshot
	// (`ak-demo-data-snapshot`) the page-switch assertions read; the default
	// full-screen editor omits it.
	await page.goto("/puck/editor?e2e=demo-tools");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });

	// Default active tab is "insert" — switch to "layer". `force: true`
	// skips Playwright's actionability stability check; the rail tab
	// trigger is wrapped in a base-ui Tooltip whose mount transition
	// can deadlock the check.
	await page.locator(`#${LAYER_RAIL_TAB_ID}`).click({ force: true });
	await expect(page.getByTestId(LAYER_MODULE_TESTID)).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByTestId(row("home"))).toBeVisible({ timeout: 15_000 });

	return { console: consoleMessages, pageErrors, failed };
}

async function openRowMenu(page: Page, pageId: string): Promise<void> {
	// Force-click — the trigger is `opacity-0` until hover/focus on the
	// row, but it is in the DOM and reachable for synthetic clicks.
	await page.getByTestId(menuTrigger(pageId)).click({ force: true });
}

// Cold-compile of `/puck/editor` under `next dev --webpack` runs
// 60–90 s on a fresh dev server (cf. `playwright.config.ts`). Bump
// the per-test timeout and serialize so the first test warms the
// route and subsequent ones inherit the compiled chunks.
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Pages panel — multi-page management", () => {
	test("baseline render — panel, seeded rows, search input visible", async ({
		page,
	}) => {
		await gotoEditor(page);
		await expect(page.getByTestId("ak-layer-pages")).toBeVisible();
		await expect(page.getByTestId(row("home"))).toBeVisible();
		await expect(page.getByTestId(row("about"))).toBeVisible();
		await expect(page.getByTestId(SEARCH_TESTID)).toBeVisible();
	});

	test("create — new page appears in the list", async ({ page }) => {
		await gotoEditor(page);
		await page.getByTestId(ADD_BUTTON_TESTID).click({ force: true });
		await page.getByTestId("ak-layer-add-page-title").fill("QA Demo Page");
		await page.getByTestId("ak-layer-add-page-submit").click({ force: true });
		// Scope to the pages list: a created page becomes active, so its
		// title now also appears in the header breadcrumb
		// (`ak-studio-breadcrumb-file`). Asserting within the panel keeps
		// this test about "the new row appears in the list".
		await expect(
			page
				.getByTestId("ak-layer-pages")
				.getByText("QA Demo Page", { exact: true }),
		).toBeVisible({
			timeout: 5_000,
		});
	});

	test("select — activates the row and updates the header breadcrumb title", async ({
		page,
	}) => {
		await gotoEditor(page);
		const breadcrumb = page.getByTestId("ak-studio-breadcrumb-file");
		// Home is the seed active page, so the breadcrumb starts on its title.
		await expect(breadcrumb).toHaveText("Home");

		// Clicking a row fires `onSelect` → the demo source marks it active
		// → core's breadcrumb reflects the new active page and the demo
		// swaps the canvas document (remounting <Studio> via `key`).
		// The snapshot mirrors the active page's Puck document. Home seeds
		// the full showcase (contains `hero-primary`); About seeds a lighter
		// navbar + Helps layout (contains `about-helps`).
		const snapshot = page.getByTestId("ak-demo-data-snapshot");
		await expect(snapshot).toContainText("hero-primary");

		await page.getByTestId(row("about")).click({ force: true });
		await expect(page.getByTestId(row("about"))).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(breadcrumb).toHaveText("About");
		// Canvas content actually swapped to About's document.
		await expect(snapshot).toContainText("about-helps");
		await expect(snapshot).not.toContainText("hero-primary");
	});

	test("rename — Enter commits and the label updates", async ({ page }) => {
		await gotoEditor(page);
		await openRowMenu(page, "about");
		await page.getByTestId(menuItem("about", "rename")).click({ force: true });
		const input = page.getByTestId(renameInput("about"));
		await input.fill("About Us");
		await input.press("Enter");
		await expect(input).toHaveCount(0);
		await expect(
			page.getByTestId(row("about")).getByText("About Us", { exact: true }),
		).toBeVisible();
	});

	test("duplicate — new (copy) row appears and is pre-selected", async ({
		page,
	}) => {
		await gotoEditor(page);
		await openRowMenu(page, "about");
		await page
			.getByTestId(menuItem("about", "duplicate"))
			.click({ force: true });
		const copyRow = page
			.locator('[data-testid^="ak-layer-page-row-about-copy-"]')
			.first();
		await expect(copyRow).toBeVisible({ timeout: 5_000 });
		await expect(copyRow).toHaveText(/About \(copy\)/);
		// Pre-select round-trip — PRD §3.3 documented exception.
		await expect(copyRow).toHaveAttribute("aria-current", "page");
	});

	test("search — filters by title, clear restores", async ({ page }) => {
		await gotoEditor(page);
		const search = page.getByTestId(SEARCH_TESTID);
		await search.fill("about");
		await expect(page.getByTestId(row("about"))).toBeVisible();
		await expect(page.getByTestId(row("home"))).toHaveCount(0);
		await expect(page.getByTestId(row("list"))).toHaveCount(0);
		await search.fill("");
		await expect(page.getByTestId(row("home"))).toBeVisible();
		await expect(page.getByTestId(row("about"))).toBeVisible();
		await expect(page.getByTestId(row("list"))).toBeVisible();
	});

	test("search — empty state renders when no rows match", async ({ page }) => {
		await gotoEditor(page);
		await page.getByTestId(SEARCH_TESTID).fill("zzz-no-match-zzz");
		await expect(page.getByTestId(SEARCH_EMPTY_TESTID)).toBeVisible();
	});

	test("locked home — Rename + Delete are suppressed, Duplicate is allowed", async ({
		page,
	}) => {
		await gotoEditor(page);
		await openRowMenu(page, "home");
		await expect(page.getByTestId(menuItem("home", "rename"))).toHaveCount(0);
		await expect(page.getByTestId(menuItem("home", "delete"))).toHaveCount(0);
		// Duplicate has no `locked` gate per the capability matrix.
		await expect(page.getByTestId(menuItem("home", "duplicate"))).toBeVisible();
		// Settings is allowed too — `onUpdateSettings` is wired in demo.
		await expect(page.getByTestId(menuItem("home", "settings"))).toBeVisible();
	});

	test("delete — confirm removes the row", async ({ page }) => {
		await gotoEditor(page);
		await expect(page.getByTestId(row("about"))).toBeVisible();
		await openRowMenu(page, "about");
		await page.getByTestId(menuItem("about", "delete")).click({ force: true });
		await page.getByTestId(deleteConfirm("about")).click({ force: true });
		await expect(page.getByTestId(row("about"))).toHaveCount(0);
	});

	test("settings dialog — opens, submits, persists the new title", async ({
		page,
	}) => {
		await gotoEditor(page);
		await openRowMenu(page, "about");
		await page
			.getByTestId(menuItem("about", "settings"))
			.click({ force: true });
		const titleInput = page.getByTestId(
			"ak-layer-page-settings-about-title-input",
		);
		await expect(titleInput).toBeVisible();
		await titleInput.fill("About — updated");
		await page
			.getByTestId("ak-layer-page-settings-about-submit")
			.click({ force: true });
		await expect(
			page
				.getByTestId(row("about"))
				.getByText("About — updated", { exact: true }),
		).toBeVisible();
	});

	test("keyboard reorder — Space + ArrowUp + Space moves a row up", async ({
		page,
	}) => {
		await gotoEditor(page);
		// Capture the original order of test ids so we can assert the
		// move actually shifted the position.
		const ids = await page
			.locator(
				'[data-testid^="ak-layer-page-row-"]:not([data-testid$="-menu"]):not([data-testid$="-rename-input"]):not([data-testid$="-rename-error"]):not([data-testid$="-drag-handle"]):not([data-testid$="-menu-popup"]):not([data-testid*="-menu-"])',
			)
			.evaluateAll((els) =>
				els
					.map((el) => el.getAttribute("data-testid") ?? "")
					.filter(
						(t) =>
							t.startsWith("ak-layer-page-row-") &&
							!t.includes("-menu") &&
							!t.includes("-rename") &&
							!t.includes("-drag-handle"),
					),
			);
		const aboutIndex = ids.indexOf("ak-layer-page-row-about");
		expect(aboutIndex).toBeGreaterThan(0);

		// Focus the drag handle and run the dnd-kit keyboard cycle.
		const handle = page.getByTestId(dragHandle("about"));
		await handle.focus();
		await page.keyboard.press("Space"); // pickup
		await page.keyboard.press("ArrowUp"); // move up
		await page.keyboard.press("Space"); // drop

		const afterIds = await page
			.locator('[data-testid^="ak-layer-page-row-"]')
			.evaluateAll((els) =>
				els
					.map((el) => el.getAttribute("data-testid") ?? "")
					.filter(
						(t) =>
							t.startsWith("ak-layer-page-row-") &&
							!t.includes("-menu") &&
							!t.includes("-rename") &&
							!t.includes("-drag-handle"),
					),
			);
		const afterAboutIndex = afterIds.indexOf("ak-layer-page-row-about");
		expect(afterAboutIndex).toBeLessThan(aboutIndex);
	});
});
