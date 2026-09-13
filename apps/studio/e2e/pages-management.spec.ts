/**
 * @file Plan 0004 P6 — End-to-end coverage for the Pages panel.
 *
 * Each `test()` exercises one capability surface added across plan
 * phases P2–P5 (rename / duplicate / delete / search / locked / drag-
 * reorder) plus the P6 page-source wiring. Conventions match
 * `sidebar-modules.spec.ts`: console/pageerror/requestfailed listeners
 * attach before navigation; the rail tablist is the hydration signal.
 *
 * Tests share helpers but each gets a fresh `page` (and therefore a
 * fresh in-memory page source instance), so ordering
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
	query = "",
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
	await page.goto(`/puck/editor?e2e=demo-tools${query}`);
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

// Cold-compile of `/puck/editor` under `next dev --turbopack` runs
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
		// Unique per run: the title becomes the record's slug, and a reused
		// dev server (local `reuseExistingServer`) already holds the last
		// run's record under that slug.
		const title = `QA Demo Page ${Date.now()}`;
		await page.getByTestId(ADD_BUTTON_TESTID).click({ force: true });
		await page.getByTestId("ak-layer-add-page-title").fill(title);
		await page.getByTestId("ak-layer-add-page-submit").click({ force: true });
		// Scope to the pages list: a created page becomes active, so its
		// title now also appears in the header breadcrumb
		// (`ak-studio-breadcrumb-file`). Asserting within the panel keeps
		// this test about "the new row appears in the list".
		await expect(
			page.getByTestId("ak-layer-pages").getByText(title, { exact: true }),
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

	test("rename — reaches the open document: later edits, save, publish and reopen keep the new title", async ({
		page,
		request,
		browser,
	}) => {
		test.setTimeout(180_000);
		// The editor's `data` prop is initial-only; a rename that patched
		// only the host's copies was undone by the next edit's `onChange`
		// (the whole document, old title included), so the following save
		// or publish wrote the old title back. Sequence: edit → rename →
		// edit → save → publish → reopen, on a page whose stored draft
		// carries the S1-T04 root props (a remote-component lock and a local
		// definition) so they are shown to survive too.
		const remoteHeroLock = {
			schemaVersion: 1,
			entries: [
				{
					componentId: "cmp-hero-fixture",
					puckType: "RemoteHero",
					releaseId: "release-hero-0.2.2",
					packageVersion: "0.2.2",
					releaseManifestDigest: `sha256:${"a".repeat(64)}`,
					hostProfileId: "studio-host-v1",
				},
			],
		};
		const localLibrary = {
			definitions: {
				"definition-1": {
					version: "1",
					id: "definition-1",
					name: "Card",
					root: { type: "Text", props: { id: "definition-root" } },
					exposedProps: [],
					variantAxes: [],
					variants: [],
					revision: 1,
					createdAt: "2026-08-13T00:00:00.000Z",
					updatedAt: "2026-08-13T00:00:00.000Z",
				},
			},
		};
		type StoredRecord = {
			pageRevision?: number;
			draft?: PageDoc;
			published?: PageDoc;
		};
		type PageDoc = {
			root: { props: Record<string, unknown> };
			content: { type: string; props: Record<string, unknown> }[];
		};
		const readRecord = async (): Promise<StoredRecord> => {
			const res = await request.get("/api/pages/profile");
			expect(res.ok()).toBe(true);
			return ((await res.json()) as { data: StoredRecord }).data;
		};
		const headlineOf = (doc: PageDoc | undefined): unknown =>
			doc?.content.find((node) => node.props.id === "profile-hero")?.props
				.headline;

		// Seed profile's draft: its published document plus the lock and the
		// local definition, at the record's current revision.
		const seed = await readRecord();
		const seededDoc = structuredClone(seed.published) as PageDoc;
		seededDoc.root.props.remoteComponentLock = remoteHeroLock;
		seededDoc.root.props.componentLibrary = localLibrary;
		const seeded = await request.post("/api/pages/draft", {
			data: {
				id: "profile",
				data: seededDoc,
				expectedPageRevision: seed.pageRevision,
			},
		});
		expect(seeded.ok()).toBe(true);

		// Collab off: this is about the host ↔ Puck document, not the relay.
		await gotoEditor(page, "&collab=0");
		await page.getByTestId(row("profile")).click({ force: true });
		await expect(page.getByTestId("ak-studio-breadcrumb-file")).toHaveText(
			"Profile",
		);
		const canvas = page.frameLocator("#preview-frame");
		const headline = page.locator("#profile-hero_textarea_headline");
		const typeAtEnd = async (text: string): Promise<void> => {
			await canvas.getByText("Write fast with").first().click({ force: true });
			await expect(headline).toBeVisible({ timeout: 15_000 });
			await headline.click({ force: true });
			await headline.focus();
			await headline.evaluate((node) => {
				const el = node as HTMLTextAreaElement;
				el.setSelectionRange(el.value.length, el.value.length);
			});
			await page.keyboard.type(text, { delay: 40 });
			// Let Puck's debounced history record settle before the next step.
			await page.waitForTimeout(500);
		};

		// 1. Edit before the rename (unsaved).
		await typeAtEnd(" A");

		// 2. Rename through the rail and wait for the server to accept it.
		await openRowMenu(page, "profile");
		await page
			.getByTestId(menuItem("profile", "rename"))
			.click({ force: true });
		const input = page.getByTestId(renameInput("profile"));
		await input.fill("Profile Renamed");
		const [renamed] = await Promise.all([
			page.waitForResponse(
				(res) =>
					res.url().includes("/api/pages/profile/settings") &&
					res.request().method() === "PATCH",
			),
			input.press("Enter"),
		]);
		expect(renamed.status()).toBe(200);
		await expect(page.getByTestId("ak-studio-breadcrumb-file")).toHaveText(
			"Profile Renamed",
		);
		await page.waitForTimeout(500);

		// 3. Edit after the rename.
		await typeAtEnd(" B");

		// 4. Save the draft (from the header's publish panel); the stored
		// draft carries the new title, both edits, the lock and the local
		// definition.
		const publishToLive = page.getByRole("button", { name: "Publish to live" });
		const openPublishPanel = async (): Promise<void> => {
			// The header "Publish" button toggles the panel and any click
			// outside dismisses it, so start from a settled closed state.
			if (await publishToLive.isVisible()) await page.keyboard.press("Escape");
			await expect(publishToLive).toBeHidden({ timeout: 5_000 });
			await page
				.getByRole("button", { name: "Publish", exact: true })
				.click({ force: true });
			await expect(publishToLive).toBeVisible({ timeout: 5_000 });
		};
		await openPublishPanel();
		const [saved] = await Promise.all([
			page.waitForResponse(
				(res) =>
					res.url().includes("/api/pages/draft") &&
					res.request().method() === "POST",
			),
			page.getByRole("button", { name: /save draft/i }).click({ force: true }),
		]);
		expect(saved.status()).toBe(200);
		await expect(page.getByTestId("page-persist-notice")).toHaveCount(0);
		const afterSave = await readRecord();
		expect(afterSave.draft?.root.props.title).toBe("Profile Renamed");
		expect(headlineOf(afterSave.draft)).toMatch(/precision\. A B$/);
		expect(afterSave.draft?.root.props.remoteComponentLock).toEqual(
			remoteHeroLock,
		);
		expect(afterSave.draft?.root.props.componentLibrary).toEqual(localLibrary);

		// Undo history survived the rename: one undo takes back the edit
		// made after it (not the rename), redo restores it.
		await page
			.getByRole("button", { name: "Undo", exact: true })
			.first()
			.click({ force: true });
		await expect(headline).toHaveValue(/precision\. A$/);
		await page
			.getByRole("button", { name: "Redo", exact: true })
			.first()
			.click({ force: true });
		await expect(headline).toHaveValue(/precision\. A B$/);

		// Publish reads the live editor document: same title, same edits.
		await openPublishPanel();
		const [published] = await Promise.all([
			page.waitForResponse(
				(res) =>
					res.url().includes("/api/pages/publish") &&
					res.request().method() === "POST",
			),
			publishToLive.click({ force: true }),
		]);
		expect(published.status()).toBe(200);
		const afterPublish = await readRecord();
		expect(afterPublish.published?.root.props.title).toBe("Profile Renamed");
		expect(headlineOf(afterPublish.published)).toMatch(/precision\. A B$/);
		expect(afterPublish.published?.root.props.remoteComponentLock).toEqual(
			remoteHeroLock,
		);
		expect(afterPublish.published?.root.props.componentLibrary).toEqual(
			localLibrary,
		);

		// 5. Reopen in a fresh session: the editor seeds from the stored
		// document.
		const session = await browser.newContext();
		const reopened = await session.newPage();
		await gotoEditor(reopened, "&collab=0");
		await reopened.getByTestId(row("profile")).click({ force: true });
		await expect(reopened.getByTestId("ak-studio-breadcrumb-file")).toHaveText(
			"Profile Renamed",
		);
		await reopened
			.frameLocator("#preview-frame")
			.getByText("Write fast with")
			.first()
			.click({ force: true });
		const reopenedHeadline = reopened.locator(
			"#profile-hero_textarea_headline",
		);
		await expect(reopenedHeadline).toHaveValue(/precision\. A B$/, {
			timeout: 15_000,
		});

		// Revision protection still holds: a write that lands elsewhere after
		// this session opened the page makes this session's next save a
		// refused conflict — nothing is overwritten, the notice shows.
		const current = await readRecord();
		const elsewhere = structuredClone(current.draft) as PageDoc;
		elsewhere.root.props.title = "Profile Elsewhere";
		const landed = await request.post("/api/pages/draft", {
			data: {
				id: "profile",
				data: elsewhere,
				expectedPageRevision: current.pageRevision,
			},
		});
		expect(landed.ok()).toBe(true);
		await reopenedHeadline.click({ force: true });
		await reopened.keyboard.type(" C", { delay: 40 });
		const stalePublishToLive = reopened.getByRole("button", {
			name: "Publish to live",
		});
		await reopened
			.getByRole("button", { name: "Publish", exact: true })
			.click({ force: true });
		await expect(stalePublishToLive).toBeVisible({ timeout: 5_000 });
		const [refused] = await Promise.all([
			reopened.waitForResponse(
				(res) =>
					res.url().includes("/api/pages/draft") &&
					res.request().method() === "POST",
			),
			reopened
				.getByRole("button", { name: /save draft/i })
				.click({ force: true }),
		]);
		expect(refused.status()).toBe(409);
		await expect(reopened.getByTestId("page-persist-notice")).toBeVisible();
		const afterConflict = await readRecord();
		expect(afterConflict.draft?.root.props.title).toBe("Profile Elsewhere");
		expect(headlineOf(afterConflict.draft)).toMatch(/precision\. A B$/);
		await session.close();
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

		// Focus the drag handle and run the dnd-kit keyboard cycle. Each key
		// waits for its observable effect before the next: dnd-kit arms its
		// keyboard listener and measures rects after activation, and applies
		// a move on the following render — keys fired faster than that are
		// dropped (no keyboard user presses that fast; a script does).
		const handle = page.getByTestId(dragHandle("about"));
		// The sortable node is the row's <li>; the list strategy translates it
		// once `over` has moved.
		const aboutItem = page
			.getByTestId(row("about"))
			.locator("xpath=ancestor::li[1]");
		await handle.focus();
		await page.keyboard.press("Space"); // pickup
		await expect(handle).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByTestId("ak-layer-pages-drag-overlay")).toBeVisible();
		await page.keyboard.press("ArrowUp"); // move up
		await expect(aboutItem).not.toHaveCSS(
			"transform",
			"matrix(1, 0, 0, 1, 0, 0)",
		);
		await page.keyboard.press("Space"); // drop

		// The drop reorders the source, which re-lists asynchronously.
		await expect
			.poll(async () => {
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
				return afterIds.indexOf("ak-layer-page-row-about");
			})
			.toBeLessThan(aboutIndex);
	});
});
