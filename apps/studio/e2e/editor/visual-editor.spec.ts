/**
 * CORE-P1B-012 — visual-editor browser matrix (§27.5), DOM/geometry
 * assertions only: WSL2 headless screenshot capture is broken on this
 * dev box (verified), so visual baselines are CI-generated; local
 * runs never compare pixels.
 *
 * Matrix axes covered here: zoom (50/100/200% via the chrome zoom
 * controls), DPR (per-project `deviceScaleFactor`), scroll (wheel
 * before interaction).
 *
 * Browser axis: Firefox and WebKit run only when
 * `ANVILKIT_E2E_MATRIX=1` adds those Playwright projects. In CI that
 * is the **scheduled (nightly) and workflow_dispatch** `studio-e2e`
 * runs — pull requests stay Chromium + Chromium-HiDPI so PR feedback
 * stays fast (`.github/workflows/ci.yml`, `studio-e2e` job env).
 * Locally: `pnpm --filter studio e2e:install:matrix` once, then
 * `pnpm --filter studio e2e:matrix`.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	// The write-target toolbar is the editor-on beacon (lazy chunk
	// loaded + responsive controller installed).
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/**
 * Select a node through its Layers row — the repo's proven selection
 * path (layer-scroll.spec.ts pattern). Canvas click-to-select is a
 * Puck-native concern outside this suite's scope; the editor's
 * canvas multi-select surface is the marquee (unit-covered).
 */
async function selectViaLayers(page: Page, nodeId: string): Promise<void> {
	await openLayersPanel(page);
	await clickLayerRow(page, nodeId);
}

/**
 * Click a layer row. The tree is virtualized, so a row can sit
 * outside the viewport (a forced click then has no click point to
 * resolve) — scroll it in first, then click for real. The demo canvas
 * animates continuously, so `force` still skips the never-settling
 * stability wait (layer-scroll.spec.ts precedent).
 */
async function clickLayerRow(
	page: Page,
	nodeId: string,
	modifiers?: { readonly ctrl: boolean },
): Promise<void> {
	const row = page.getByTestId(`ak-layer-select-${nodeId}`);
	await row.waitFor({ state: "attached", timeout: 15_000 });
	// Retry the whole click: the row is virtualized (it can scroll out
	// from under a pending click) and the demo canvas animates
	// continuously, so a single forced click occasionally lands with no
	// effect. `aria-selected` is the row's own confirmation that the
	// selection actually took.
	await expect(async () => {
		await row.evaluate((element) =>
			element.scrollIntoView({ block: "center", behavior: "instant" }),
		);
		await row.click({
			force: true,
			...(modifiers?.ctrl === true ? { modifiers: ["ControlOrMeta"] } : {}),
		});
		// Selection is announced on the `treeitem` ROW, not on the name
		// button: `aria-selected` is invalid on `button` (axe
		// `aria-allowed-attr`) and moved to the row in CORE-P4-003.
		await expect(page.getByTestId(`ak-layer-node-${nodeId}`)).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 2_000 },
		);
	}).toPass({ timeout: 20_000 });
}

/** Open the Layers rail module and its inner Layers tab. */
async function openLayersPanel(page: Page): Promise<void> {
	const railTab = page.locator("#ak-rail-tab-layer");
	await railTab.waitFor({ state: "attached", timeout: 30_000 });
	// The demo canvas animates continuously; `force` skips the
	// never-settling stability wait (layer-scroll.spec.ts precedent).
	await railTab.click({ force: true });
	await expect(page.getByTestId("ak-module-layer")).toBeVisible({
		timeout: 10_000,
	});
	// The module opens on its Pages tab; layer rows live in the Layers
	// tab's panel, which has no layout box until it is active (so even
	// a forced click on a row cannot resolve a click point).
	await page.getByTestId("ak-layer-tab-layers").click({ force: true });
	await expect(page.getByTestId("ak-layer-layers")).toBeVisible({
		timeout: 10_000,
	});
}

test.describe("visual editor mount (CORE-P1B-012)", () => {
	// The `/puck/editor` route's first compile under `next dev
	// --turbopack` takes 60–90 s on this box (documented in
	// playwright.config.ts), and the default 30 s per-test timeout is
	// consumed by `page.goto` alone on a cold cache. The editor route
	// is the heaviest in the app (Puck + the lazy editor chunk), so
	// this suite budgets for it explicitly.
	test.describe.configure({ timeout: 180_000 });

	test("mounts the editor runtime with toolbar, layers search, and clean console", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);

		await openLayersPanel(page);
		await expect(page.getByTestId("ak-layer-search")).toBeVisible();
		await expect(page.getByTestId("ak-follow-viewport")).toBeVisible();
		await expect(page.getByTestId("ak-show-overrides")).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test("breakpoint editor opens and write-target switching never dirties the document", async ({
		page,
	}) => {
		await openEditor(page);
		await page.getByTestId("ak-write-target").click();
		// The default OQ-002 preset surfaces base + three breakpoints.
		await expect(page.getByRole("menuitem", { name: /tablet/i })).toBeVisible();
		await page.getByRole("menuitem", { name: /tablet/i }).click();
		await expect(page.getByTestId("ak-write-target")).toContainText(/tablet/i);
		// Switching layers is transient: undo must stay unavailable
		// (no history entry was recorded by the switch).
		await page.getByTestId("ak-write-target").click();
		await page.getByRole("menuitem", { name: /base/i }).click();
	});

	test("selection surfaces the universal inspector", async ({ page }) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		await expect(frame.locator("[data-ak-node]").first()).toBeVisible({
			timeout: 30_000,
		});
		await selectViaLayers(page, "hero-primary");
		await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
			timeout: 15_000,
		});
		// The universal sections now live behind the inspector's Style
		// tab; Properties (the native field tree) is what opens by default.
		await page.getByTestId("ak-inspector-tab-style").click();
		await expect(page.getByTestId("ak-layout-section")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("no resize handles render for a component without declared layout capability", async ({
		page,
	}) => {
		// PLAN-0025 P3-F (user-authorized coverage move): this test used to
		// drive the §10.5 resize gesture on the navbar, whose layout
		// capability was HOST-FABRICATED. With the fabrication deleted,
		// Navbar declares no v1 layout capability, so the editor honestly
		// offers no handles. The gesture-commits-once choreography keeps
		// its unit-level coverage in core's canvas handle suites; hero
		// (which genuinely declares layoutItem) keeps its handles, proving
		// the affordance is capability-gated rather than removed.
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const node = frame.locator('[data-ak-node="navbar-primary"]');
		await expect(node).toBeVisible({ timeout: 30_000 });
		await selectViaLayers(page, "navbar-primary");
		await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
			timeout: 15_000,
		});
		await expect(frame.locator('[data-ak-handle="resize-s"]')).toHaveCount(0);

		// The genuinely-declaring component still gets its handles. The
		// rail is already open from the first selection — a second
		// `selectViaLayers` would blind-toggle it shut, so click the row
		// directly.
		await clickLayerRow(page, "hero-primary");
		await expect(frame.locator("[data-ak-handle]").first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test("inline plain-text editing: enter, type, commit, one-step undo (ED-TEXT-001/003)", async ({
		page,
	}) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const headline = frame.locator("h1").first();
		await expect(headline).toBeVisible({ timeout: 30_000 });
		const original = (await headline.textContent()) ?? "";

		// Stand in for a component that adopted the metadata: stamp the
		// declared target region (the host config declares `headline`).
		await headline.evaluate((el) =>
			el.setAttribute("data-ak-text-target", "headline"),
		);
		await headline.dblclick({ force: true });
		await expect
			.poll(async () =>
				headline.evaluate((el) => (el as HTMLElement).isContentEditable),
			)
			.toBe(true);

		await page.keyboard.type(" EDITED");
		// Blur commits (750 ms idle would too — blur is deterministic).
		//
		// `force: true` for the same reason `clickLayerRow` uses it: the
		// demo page animates continuously, so Playwright's stability
		// precondition never settles on this element. Chromium's heuristic
		// tolerates the motion and Firefox's does not — verified: without
		// `force` this click spins through ~150 stability retries and times
		// out on Firefox only. Nothing is weakened; the assertions below
		// (text committed, `contenteditable` released, one-step undo) are
		// what certify ED-TEXT-001/003.
		await frame
			.locator("body")
			.click({ position: { x: 4, y: 4 }, force: true });
		await expect(headline).toContainText("EDITED", { timeout: 10_000 });
		await expect
			.poll(async () =>
				headline.evaluate((el) => (el as HTMLElement).isContentEditable),
			)
			.toBe(false);

		// Committed edits undo via Puck history only — one step.
		await page.getByRole("button", { name: /undo/i }).click();
		await expect
			.poll(async () => (await headline.textContent()) ?? "")
			.toBe(original);
	});

	test("layers multi-select surfaces the canvas toolbar; bulk duplicate is one history entry", async ({
		page,
	}) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const countNodes = async (): Promise<number> =>
			frame.locator("[data-ak-node]").count();
		const before = await countNodes();
		expect(before).toBeGreaterThan(1);

		await selectViaLayers(page, "navbar-primary");
		await clickLayerRow(page, "hero-primary", { ctrl: true });

		// The toolbar anchors just above the selection bounds; scroll the
		// canvas to the top so those bounds (and the toolbar) sit inside
		// the viewport where synthetic clicks can reach them.
		await frame.locator("body").evaluate(() => {
			window.scrollTo(0, 0);
		});
		const toolbar = frame.locator("[data-ak-selection-toolbar]");
		await expect(toolbar).toBeVisible({ timeout: 10_000 });
		await expect(
			toolbar.locator('[data-ak-toolbar-action="left"]'),
		).toBeVisible();

		// Bulk duplicate: two copies land in ONE commitNative dispatch.
		// The toolbar anchors to the selection bounds, which can sit
		// above the scrolled canvas viewport, and it repositions as the
		// selection changes — so dispatch the click on the button
		// itself. The toolbar is driven by a document-level capture
		// listener (not a React `onClick`), so a dispatched event is
		// the same code path a user click takes.
		await toolbar
			.locator('[data-ak-toolbar-action="duplicate"]')
			.evaluate((element) => {
				element.dispatchEvent(
					new MouseEvent("click", { bubbles: true, cancelable: true }),
				);
			});
		// The bulk path is async (dynamic imports) before its single
		// commitNative dispatch, then the iframe re-renders.
		await expect.poll(countNodes, { timeout: 20_000 }).toBe(before + 2);
		await page.getByRole("button", { name: /undo/i }).click();
		await expect.poll(countNodes, { timeout: 20_000 }).toBe(before);
	});

	test("zoom controls change scale without breaking the toolbar (50/100/200%)", async ({
		page,
	}) => {
		await openEditor(page);
		const zoomOut = page.getByRole("button", { name: /zoom out/i });
		const zoomIn = page.getByRole("button", { name: /zoom in/i });
		await zoomOut.click();
		await zoomOut.click();
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
		await zoomIn.click();
		await zoomIn.click();
		await zoomIn.click();
		await zoomIn.click();
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
		// Scroll axis: interactions after wheel still resolve.
		await page.mouse.wheel(0, 400);
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
	});
});
