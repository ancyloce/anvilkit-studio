/**
 * Design tokens, end to end: field literal → token → canvas.
 *
 * The regression this pins is that a token-backed value used to be
 * invisible on the canvas even though it exported correctly. Three
 * independent faults stacked up, and each one alone hid the next:
 *
 * 1. the picker's create-from-literal committed `token.create` and
 *    then attached through a callback carrying the PRE-create
 *    `expectedRevision`, so the attach was rejected as a conflict and
 *    the field quietly kept its literal;
 * 2. the live authoring stylesheet called the serializer directly,
 *    without the token substitution the export pipeline runs, so a
 *    `{kind:"token"}` value serialized to nothing;
 * 3. the per-node fragment cache keyed on the node record alone, and a
 *    token edit changes `authoring.tokens` without touching any node
 *    record — so even a resolved token never re-emitted.
 *
 * Unit tests cover each fault (`token-picker`, `stylesheet`,
 * `design-system-panel`). This spec is the product-level proof that the
 * whole chain works in the real editor, which is the only place all
 * three met.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/** Idempotent: the rail collapses an already-active tab on re-click. */
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

/** Open the design-system tab of the Components rail module. */
async function openDesignSystemPanel(page: Page): Promise<void> {
	const module = page.getByTestId("ak-module-components");
	if (!(await module.isVisible().catch(() => false))) {
		await page.locator("#ak-rail-tab-components").click({ force: true });
	}
	await expect(module).toBeVisible({ timeout: 30_000 });
	await page.getByTestId("ak-components-tab-tokens").click({ force: true });
	await expect(page.getByTestId("ak-design-system-panel")).toBeVisible({
		timeout: 20_000,
	});
}

/** Select the first top-level node and return its id. */
async function selectFirstNode(page: Page): Promise<string> {
	await openLayersPanel(page);
	const ids = await page.evaluate(() =>
		[...document.querySelectorAll("[data-testid^='ak-layer-select-']")]
			.map((element) =>
				(element.getAttribute("data-testid") ?? "").replace(
					"ak-layer-select-",
					"",
				),
			)
			.filter((id) => id.length > 0),
	);
	const nodeId = ids[0];
	expect(nodeId, "demo document has at least one layer row").toBeTruthy();

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
	return nodeId as string;
}

/** The node's live computed width, read inside the canvas iframe. */
function widthOf(page: Page, nodeId: string): Promise<string> {
	return page
		.frameLocator("iframe")
		.first()
		.locator(`[data-ak-node="${nodeId}"]`)
		.evaluate((element) => getComputedStyle(element).width);
}

test.describe("design tokens — field → token → canvas", () => {
	// The editor's documented cold start is 60-90 s under `next dev`.
	test.describe.configure({ timeout: 180_000 });

	test("a token created from a value keeps painting, and editing it repaints", async ({
		page,
	}) => {
		await openEditor(page);
		const nodeId = await selectFirstNode(page);
		await page.getByTestId("ak-inspector-tab-style").click();
		await expect(page.getByTestId("ak-inspector-panel-style")).toBeVisible({
			timeout: 15_000,
		});

		// --- a plain literal paints ------------------------------------
		const width = page.getByTestId("ak-layout-width");
		await width.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("400");
		await page.keyboard.press("Enter");
		await expect.poll(() => widthOf(page, nodeId)).toBe("400px");

		// --- create a token FROM that literal --------------------------
		await page
			.getByTestId("ak-inspector-panel-style")
			.getByTestId("ak-token-picker-trigger")
			.first()
			.click();
		await page.getByTestId("ak-token-new-name").fill("size.hero");
		await page.getByTestId("ak-token-create").click();
		// The field really is token-backed now — this badge replaces the
		// number input only when the stored value is `{kind:"token"}`.
		await expect(page.getByTestId("ak-length-token")).toBeVisible({
			timeout: 15_000,
		});
		await page.keyboard.press("Escape");
		// …and the canvas still shows the value, because the stylesheet
		// resolves the reference. This is the assertion that used to fail:
		// the property vanished and the node fell back to full width.
		await expect.poll(() => widthOf(page, nodeId)).toBe("400px");

		// --- edit the token in the design panel ------------------------
		await openDesignSystemPanel(page);
		const value = page.getByTestId("ak-token-mode-value").first();
		// `length` literals are objects; the panel used to disable this
		// input entirely, so the type the picker creates most could not
		// be edited at all.
		await expect(value).toBeEnabled();
		await expect(value).toHaveValue("400px");

		await value.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("640px");
		await page.keyboard.press("Tab");
		// Every node using the token repaints, with no node record touched.
		await expect.poll(() => widthOf(page, nodeId), { timeout: 15_000 }).toBe(
			"640px",
		);
	});

	test("an unparsable token value is refused, not stored", async ({ page }) => {
		await openEditor(page);
		const nodeId = await selectFirstNode(page);
		await page.getByTestId("ak-inspector-tab-style").click();
		await expect(page.getByTestId("ak-inspector-panel-style")).toBeVisible({
			timeout: 15_000,
		});
		const width = page.getByTestId("ak-layout-width");
		await width.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("400");
		await page.keyboard.press("Enter");
		await expect.poll(() => widthOf(page, nodeId)).toBe("400px");

		await page
			.getByTestId("ak-inspector-panel-style")
			.getByTestId("ak-token-picker-trigger")
			.first()
			.click();
		await page.getByTestId("ak-token-new-name").fill("size.hero");
		await page.getByTestId("ak-token-create").click();
		await expect(page.getByTestId("ak-length-token")).toBeVisible({
			timeout: 15_000,
		});
		await page.keyboard.press("Escape");

		await openDesignSystemPanel(page);
		const value = page.getByTestId("ak-token-mode-value").first();
		await value.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("not-a-length");
		await page.keyboard.press("Tab");

		await expect(page.getByTestId("ak-token-row-errors")).toBeVisible({
			timeout: 15_000,
		});
		// The stored value survives a rejected edit — no silent coercion
		// of a typed `CssLength` into the raw text.
		await expect.poll(() => widthOf(page, nodeId)).toBe("400px");
	});
});
