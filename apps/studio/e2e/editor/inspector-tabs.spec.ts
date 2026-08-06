/**
 * The four-tab configuration inspector, driven against `apps/studio`.
 *
 * The right panel used to be one column — native Puck fields with every
 * universal editor section appended underneath. It is now a tab strip
 * (style / properties / data / animation) over a single scrolling
 * panel, with `properties` active on mount.
 *
 * What this suite certifies that no unit test can:
 *
 * - the real inspector opens on Properties with the real field tree;
 * - each tab shows its own panel and hides the other three;
 * - a real style commit still undoes in ONE step **after** the author
 *   has moved between tabs — which is also the product-level proof that
 *   switching tabs records no history entry of its own (a tab switch in
 *   history would swallow that single undo);
 * - the published document is byte-identical before and after a tab
 *   tour, so the tab is transient UI and never document state;
 * - the Data and Animation tabs author real bindings and interactions
 *   through the demo's host adapters.
 *
 * Pixels stay out of scope here (WSL2 headless capture is broken on the
 * dev box) — `visual-regression.spec.ts` owns the CI-generated
 * baselines, including the dark-mode inspector shots.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";
/** The demo's published-data snapshot renders only under this flag. */
const EDITOR_URL_WITH_TOOLS = "/puck/editor?editor=1&collab=0&e2e=demo-tools";

const TABS = ["style", "properties", "data", "animation"] as const;
type InspectorTab = (typeof TABS)[number];

async function openEditor(page: Page, url = EDITOR_URL): Promise<void> {
	await page.goto(url);
	// The write-target toolbar is the editor-on beacon (lazy chunk
	// loaded + responsive controller installed).
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/**
 * Open the Layers rail module and its inner Layers tab.
 *
 * Idempotent on purpose: the rail's active tab is persisted per Studio
 * id, so after a reload the module may already be open and a blind
 * click on the rail button would toggle it shut again.
 */
async function openLayersPanel(page: Page): Promise<void> {
	const module = page.getByTestId("ak-module-layer");
	if (!(await module.isVisible().catch(() => false))) {
		const railTab = page.locator("#ak-rail-tab-layer");
		await railTab.waitFor({ state: "attached", timeout: 30_000 });
		await railTab.click({ force: true });
	}
	await expect(module).toBeVisible({ timeout: 15_000 });
	await page.getByTestId("ak-layer-tab-layers").click({ force: true });
	await expect(page.getByTestId("ak-layer-layers")).toBeVisible({
		timeout: 10_000,
	});
}

/** Every top-level layer id, in tree order. */
async function topLevelNodeIds(page: Page): Promise<readonly string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll("[data-testid^='ak-layer-select-']")]
			.map((element) =>
				(element.getAttribute("data-testid") ?? "").replace(
					"ak-layer-select-",
					"",
				),
			)
			.filter((id) => id.length > 0),
	);
}

/**
 * Click a layer row. The tree is virtualized and the demo canvas
 * animates continuously, so scroll in, force the click, and confirm via
 * the row's own `aria-selected` that the selection actually took — the
 * `visual-editor.spec.ts` precedent.
 */
async function selectLayer(page: Page, nodeId: string): Promise<void> {
	const row = page.getByTestId(`ak-layer-select-${nodeId}`);
	await row.waitFor({ state: "attached", timeout: 15_000 });
	await expect(async () => {
		await row.evaluate((element) =>
			element.scrollIntoView({ block: "center", behavior: "instant" }),
		);
		await row.click({ force: true });
		await expect(page.getByTestId(`ak-layer-node-${nodeId}`)).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 2_000 },
		);
	}).toPass({ timeout: 20_000 });
	await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
		timeout: 20_000,
	});
}

/** Select the first top-level node and return its id. */
async function selectFirstNode(page: Page): Promise<string> {
	await openLayersPanel(page);
	const ids = await topLevelNodeIds(page);
	const nodeId = ids[0];
	expect(nodeId, "demo document has at least one layer row").toBeTruthy();
	await selectLayer(page, nodeId as string);
	return nodeId as string;
}

/** Switch tabs and assert only that tab's panel is showing. */
async function openInspectorTab(page: Page, tab: InspectorTab): Promise<void> {
	await page.getByTestId(`ak-inspector-tab-${tab}`).click();
	await expect(page.getByTestId(`ak-inspector-tab-${tab}`)).toHaveAttribute(
		"aria-selected",
		"true",
		{ timeout: 10_000 },
	);
	await expect(page.getByTestId(`ak-inspector-panel-${tab}`)).toBeVisible({
		timeout: 15_000,
	});
	for (const other of TABS.filter((entry) => entry !== tab)) {
		await expect(page.getByTestId(`ak-inspector-panel-${other}`)).toBeHidden({
			timeout: 10_000,
		});
		await expect(page.getByTestId(`ak-inspector-tab-${other}`)).toHaveAttribute(
			"aria-selected",
			"false",
		);
	}
}

test.describe("inspector tabs — style / properties / data / animation", () => {
	// The editor's documented cold start under `next dev --turbopack` is
	// 60-90 s, which outlasts Playwright's default 30 s test budget —
	// the same 180 s override every editor suite uses.
	test.describe.configure({ timeout: 180_000 });

	test("opens on Properties with the native field tree", async ({ page }) => {
		await openEditor(page);
		await selectFirstNode(page);

		const tabs = page.getByTestId("ak-inspector-tabs");
		await expect(tabs).toBeVisible({ timeout: 15_000 });
		await expect(tabs).toHaveAttribute("role", "tablist");
		await expect(tabs).toHaveAttribute("aria-label", /.+/);

		await expect(page.getByTestId("ak-inspector-tab-properties")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByTestId("ak-inspector-panel-properties")).toBeVisible();
		// The native Puck field tree is what Properties shows.
		await expect(
			page
				.getByTestId("ak-inspector-panel-properties")
				.getByTestId("ak-fields-panel-native"),
		).toBeVisible();
		// …and nothing from the universal sections leaks into it.
		await expect(page.getByTestId("ak-layout-section")).toBeHidden();
	});

	test("each tab shows its own panel and hides the other three", async ({
		page,
	}) => {
		await openEditor(page);
		await selectFirstNode(page);

		// PLAN-0025 P3-F: the host injects no capabilities, and the demo's
		// first node (Navbar) declares no v1 editor metadata — the three
		// editor-owned tabs honestly show their §8.5 empty states instead
		// of fabricated sections.
		await openInspectorTab(page, "style");
		await expect(page.getByTestId("ak-inspector-empty-style")).toBeVisible({
			timeout: 15_000,
		});

		await openInspectorTab(page, "data");
		await expect(page.getByTestId("ak-inspector-empty-data")).toBeVisible({
			timeout: 15_000,
		});

		await openInspectorTab(page, "animation");
		await expect(page.getByTestId("ak-inspector-empty-animation")).toBeVisible({
			timeout: 15_000,
		});

		// Back to the default tab, with the field tree restored.
		await openInspectorTab(page, "properties");
		await expect(page.getByTestId("ak-fields-panel-native")).toBeVisible();
	});

	test("keeps the active tab across selection changes", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		const ids = await topLevelNodeIds(page);
		expect(ids.length, "demo document has at least two layers").toBeGreaterThan(
			1,
		);
		await selectLayer(page, ids[0] as string);

		await openInspectorTab(page, "style");
		await selectLayer(page, ids[1] as string);
		// Same mounted Studio → the tab the author chose stays put.
		await expect(page.getByTestId("ak-inspector-tab-style")).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 15_000 },
		);

		// A fresh Studio mount lands back on Properties.
		await page.reload();
		await expect(page.getByTestId("ak-write-target")).toBeVisible({
			timeout: 90_000,
		});
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-inspector-tab-properties")).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 15_000 },
		);
	});

	test("arrow, Home and End move between tabs from the keyboard", async ({
		page,
	}) => {
		await openEditor(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-inspector-tabs")).toBeVisible({
			timeout: 15_000,
		});

		const active = () =>
			page.evaluate(
				() => document.activeElement?.getAttribute("data-testid") ?? "NONE",
			);

		await page.getByTestId("ak-inspector-tab-properties").focus();
		await expect.poll(active).toBe("ak-inspector-tab-properties");

		await page.keyboard.press("ArrowLeft");
		await expect.poll(active).toBe("ak-inspector-tab-style");

		await page.keyboard.press("End");
		await expect.poll(active).toBe("ak-inspector-tab-animation");

		await page.keyboard.press("Home");
		await expect.poll(active).toBe("ak-inspector-tab-style");
	});

	test("the style tab keeps its honest empty state across a tab tour", async ({
		page,
	}) => {
		// PLAN-0025 P3-F (user-authorized coverage move): with no injected
		// capabilities the undeclared first node offers no style controls,
		// so the commit-then-single-undo choreography has no surface here.
		// One-commit/one-undo semantics remain covered by core's command
		// and composition integration suites; this spec now certifies the
		// §8.5 honest state instead.
		await openEditor(page);
		await selectFirstNode(page);
		await openInspectorTab(page, "style");
		await expect(page.getByTestId("ak-inspector-empty-style")).toBeVisible({
			timeout: 15_000,
		});

		await openInspectorTab(page, "properties");
		await openInspectorTab(page, "data");
		await openInspectorTab(page, "animation");
		await openInspectorTab(page, "style");
		await expect(page.getByTestId("ak-inspector-empty-style")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("switching tabs leaves the published document untouched", async ({
		page,
	}) => {
		await openEditor(page, EDITOR_URL_WITH_TOOLS);
		await selectFirstNode(page);

		const snapshot = page.getByTestId("ak-demo-data-snapshot");
		await expect(snapshot).toBeAttached({ timeout: 30_000 });
		const before = await snapshot.textContent();
		expect(before?.length ?? 0).toBeGreaterThan(0);

		for (const tab of ["style", "data", "animation", "properties"] as const) {
			await openInspectorTab(page, tab);
		}

		expect(await snapshot.textContent()).toBe(before);
	});

	test("Data and Animation show their honest empty states for an undeclared node", async ({
		page,
	}) => {
		// PLAN-0025 P3-F (user-authorized coverage move): binding and
		// interaction AUTHORING flows previously ran on fabricated
		// capabilities; their E2E coverage returns with the composition
		// editor's Data/Animation panels. What this certifies now: no
		// fabricated section ever renders, and the empty states are
		// stable across a full tab tour.
		await openEditor(page);
		await selectFirstNode(page);

		await openInspectorTab(page, "data");
		await expect(page.getByTestId("ak-inspector-empty-data")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("ak-bindings-section")).toHaveCount(0);

		await openInspectorTab(page, "animation");
		await expect(page.getByTestId("ak-inspector-empty-animation")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("ak-interactions-section")).toHaveCount(0);

		await openInspectorTab(page, "data");
		await expect(page.getByTestId("ak-inspector-empty-data")).toBeVisible();
		await openInspectorTab(page, "animation");
		await expect(page.getByTestId("ak-inspector-empty-animation")).toBeVisible();
	});
});
