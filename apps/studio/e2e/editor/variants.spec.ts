/**
 * Components and variants — the full authoring workflow
 * (CORE-P2-009F/G/H; ED-COMP-001..008, ED-VARIANT-001/002;
 * DD-DEC-009/-010; DD-0019 §14, §32.3).
 *
 * ### What changed, and why the old header is gone
 *
 * The previous version of this file said the variant *authoring* form
 * "does not ship yet" and certified only the one flow a user could
 * reach: multi-select → Create component. Everything else was
 * unit-tested and unreachable. The product surface now exists — a
 * Components panel, a naming dialog, a variant-axis editor inside the
 * isolated canvas, and an instance inspector — so this suite drives it
 * end to end instead of documenting its absence.
 *
 * ### Still DOM/state assertions only
 *
 * Visual certification remains CI-only: WSL2 headless screenshot
 * capture is broken on the dev box (verified in the Phase 1B close),
 * so pixels live in `visual-regression.spec.ts` under the
 * `editor-visual` project. This file asserts DOM and sidecar state,
 * the same split `visual-editor.spec.ts` uses. Nothing here is skipped
 * conditionally on a feature existing.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/**
 * Open the Layers rail module and its inner Layers tab.
 *
 * Idempotent: the rail implements collapse-on-active-click (PRD §3.2,
 * `SidebarRail.handleTabClick`), so a second blind click on an already
 * active-and-expanded tab COLLAPSES the panel. Several scenarios below
 * call this both directly and through `createNamedComponent`, which is
 * exactly that second click.
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

/** Open the Components rail module (present only with the editor on). */
async function openComponentsPanel(page: Page): Promise<void> {
	const railTab = page.locator("#ak-rail-tab-components");
	await railTab.waitFor({ state: "attached", timeout: 30_000 });
	await railTab.click({ force: true });
	await expect(page.getByTestId("ak-module-components")).toBeVisible({
		timeout: 10_000,
	});
	await page.getByTestId("ak-components-tab-components").click({ force: true });
}

/**
 * Click a layer row. The tree is virtualized and the demo canvas
 * animates continuously, so scroll the row in and force the click —
 * the `visual-editor.spec.ts` precedent.
 */
async function clickLayerRow(
	page: Page,
	nodeId: string,
	modifiers?: { readonly ctrl: boolean },
): Promise<void> {
	const row = page.getByTestId(`ak-layer-select-${nodeId}`);
	await row.waitFor({ state: "attached", timeout: 15_000 });
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

/** The top-level layer node ids in the demo document. */
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
 * Capture the first two top-level nodes as a **named** component.
 * Every later scenario starts from this.
 */
async function createNamedComponent(page: Page, name: string): Promise<void> {
	await openLayersPanel(page);
	const ids = await topLevelNodeIds(page);
	expect(
		ids.length,
		"the demo document must have at least two top-level layers",
	).toBeGreaterThanOrEqual(2);

	await clickLayerRow(page, ids[0] as string);
	await clickLayerRow(page, ids[1] as string, { ctrl: true });

	const frame = page.frameLocator("iframe").first();
	await frame
		.locator("[data-ak-toolbar-action='create-component']")
		.click({ force: true });

	// The naming dialog lives in the MAIN document — the toolbar that
	// opened it renders inside the canvas iframe, where a modal cannot.
	const dialog = page.getByTestId("ak-create-component-dialog");
	await expect(dialog).toBeVisible({ timeout: 20_000 });
	await page.getByTestId("ak-create-component-name").fill(name);
	await page.getByTestId("ak-create-component-confirm").click();
	await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** The definition id of the first row in the Components panel. */
async function firstDefinitionId(page: Page): Promise<string> {
	const row = page.getByTestId("ak-component-row").first();
	await expect(row).toBeVisible({ timeout: 20_000 });
	const id = await row.getAttribute("data-component-id");
	expect(id, "a component row must carry its definition id").toBeTruthy();
	return id as string;
}

/** Author one axis with two options inside the isolated canvas. */
async function authorAxis(page: Page, axisName: string): Promise<string> {
	await expect(page.getByTestId("ak-variant-editor")).toBeVisible({
		timeout: 20_000,
	});
	await page.getByTestId("ak-variant-axis-add-input").fill(axisName);
	await page.getByTestId("ak-variant-axis-add-submit").click();
	await expect(page.getByTestId("ak-variant-axis")).toHaveCount(1, {
		timeout: 20_000,
	});
	const axisId = await page
		.getByTestId("ak-variant-axis")
		.first()
		.getAttribute("data-axis-id");
	await page.getByTestId(`ak-variant-option-add-${axisId}-input`).fill("Large");
	await page.getByTestId(`ak-variant-option-add-${axisId}-submit`).click();
	await expect(page.getByTestId("ak-variant-option")).toHaveCount(2, {
		timeout: 20_000,
	});
	return axisId as string;
}

test.describe("components and variants (CORE-P2-009H)", () => {
	// The `/puck/editor` route's first compile under `next dev
	// --turbopack` takes 60–90 s on this box (documented in
	// playwright.config.ts).
	test.describe.configure({ timeout: 240_000 });

	test("the isolated component canvas stays hidden in page scope", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);
		await openLayersPanel(page);

		// Page scope must not render the component canvas (§10.6).
		await expect(page.getByTestId("ak-component-canvas")).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test("1. creates a NAMED component from multiple selected nodes", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);
		await openLayersPanel(page);
		const before = (await topLevelNodeIds(page)).length;

		await createNamedComponent(page, "Promo card");

		// Two nodes leave the page, one instance replaces them.
		await expect(async () => {
			expect((await topLevelNodeIds(page)).length).toBe(before - 1);
		}).toPass({ timeout: 20_000 });

		// The name the user typed is what the library shows — not the
		// hardcoded "Component" the old capture path committed.
		await openComponentsPanel(page);
		await expect(
			page.getByTestId("ak-components-list").getByText("Promo card"),
		).toBeVisible({ timeout: 20_000 });
		expect(pageErrors).toEqual([]);
	});

	test("2. creates another instance from the Components panel", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);

		const definitionId = await firstDefinitionId(page);
		const countBefore = Number(
			await page
				.getByTestId("ak-component-row")
				.first()
				.getByTestId("ak-component-instance-count")
				.textContent(),
		);

		await page.getByTestId(`ak-component-insert-${definitionId}`).click();
		await expect(async () => {
			const after = Number(
				await page
					.getByTestId("ak-component-row")
					.first()
					.getByTestId("ak-component-instance-count")
					.textContent(),
			);
			expect(after).toBe(countBefore + 1);
		}).toPass({ timeout: 20_000 });
	});

	test("3. enters and exits isolated editing from the panel", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);

		const definitionId = await firstDefinitionId(page);
		await page.getByTestId(`ak-component-open-${definitionId}`).click();

		await openLayersPanel(page);
		const canvas = page.getByTestId("ak-component-canvas");
		await expect(canvas).toBeVisible({ timeout: 20_000 });
		await expect(page.getByTestId("ak-component-name")).toHaveText(
			"Promo card",
		);

		await page.getByTestId("ak-component-exit").click();
		await expect(canvas).toBeHidden({ timeout: 20_000 });
	});

	test("4. edits the definition and the change propagates", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);
		const definitionId = await firstDefinitionId(page);

		// Rename is a definition edit; it propagates by resolution, with
		// no per-instance copies to update (ED-COMP-003).
		await page.getByTestId(`ak-component-rename-${definitionId}`).click();
		const input = page.getByTestId("ak-component-rename-input");
		await input.fill("Renamed card");
		await input.press("Enter");

		await expect(
			page.getByTestId("ak-components-list").getByText("Renamed card"),
		).toBeVisible({ timeout: 20_000 });

		// The isolated canvas shows the new name too.
		await page.getByTestId(`ak-component-open-${definitionId}`).click();
		await openLayersPanel(page);
		await expect(page.getByTestId("ak-component-name")).toHaveText(
			"Renamed card",
			{ timeout: 20_000 },
		);
	});

	test("5. creates variant axes and options inside the isolated canvas", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);
		const definitionId = await firstDefinitionId(page);
		await page.getByTestId(`ak-component-open-${definitionId}`).click();
		await openLayersPanel(page);

		await authorAxis(page, "Size");
		// The combination strip reflects the new model.
		await expect(
			page.getByTestId("ak-variant-combination-count"),
		).toBeVisible();
		await expect(page.getByTestId("ak-component-variant-strip")).toBeVisible({
			timeout: 20_000,
		});
	});

	test("6. enforces the 3-axis cap in the UI", async ({ page }) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);
		const definitionId = await firstDefinitionId(page);
		await page.getByTestId(`ak-component-open-${definitionId}`).click();
		await openLayersPanel(page);
		await expect(page.getByTestId("ak-variant-editor")).toBeVisible({
			timeout: 20_000,
		});

		for (const name of ["One", "Two", "Three"]) {
			await page.getByTestId("ak-variant-axis-add-input").fill(name);
			await page.getByTestId("ak-variant-axis-add-submit").click();
			await page.waitForTimeout(200);
		}
		await expect(page.getByTestId("ak-variant-axis")).toHaveCount(3, {
			timeout: 30_000,
		});
		// The affordance disables at the cap rather than failing on submit.
		await expect(page.getByTestId("ak-variant-axis-add-submit")).toBeDisabled();
	});

	test("7. exposes a variant selector on the instance", async ({ page }) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);
		const definitionId = await firstDefinitionId(page);

		await page.getByTestId(`ak-component-open-${definitionId}`).click();
		await openLayersPanel(page);
		const axisId = await authorAxis(page, "Size");
		await page.getByTestId("ak-component-exit").click();
		await expect(page.getByTestId("ak-component-canvas")).toBeHidden({
			timeout: 20_000,
		});

		// Select the instance; the inspector exposes one select per axis
		// and it dispatches `component.instance.variant.set`.
		const ids = await topLevelNodeIds(page);
		await clickLayerRow(page, ids[0] as string);
		await expect(
			page.getByTestId(`ak-component-variant-select-${axisId}`),
		).toBeVisible({ timeout: 20_000 });
	});

	test("8. exposes reset / promote / detach on an instance", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openLayersPanel(page);
		const ids = await topLevelNodeIds(page);
		await clickLayerRow(page, ids[0] as string);

		await expect(page.getByTestId("ak-component-instance-section")).toBeVisible(
			{ timeout: 20_000 },
		);
		// Override management and the two entry points are reachable;
		// reset-all disables while the instance carries no overrides.
		await expect(page.getByTestId("ak-component-reset-all")).toBeVisible();
		await expect(
			page.getByTestId("ak-component-overrides-empty"),
		).toBeVisible();
		await expect(
			page.getByTestId("ak-component-edit-definition"),
		).toBeVisible();
		await expect(page.getByTestId("ak-component-detach")).toBeEnabled();
	});

	test("9. detaches an instance", async ({ page }) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openLayersPanel(page);
		const ids = await topLevelNodeIds(page);
		const before = ids.length;
		await clickLayerRow(page, ids[0] as string);

		await expect(page.getByTestId("ak-component-detach")).toBeEnabled({
			timeout: 20_000,
		});
		await page.getByTestId("ak-component-detach").click();

		// It stops being an instance, and the nodes stay on the page.
		await expect(page.getByTestId("ak-component-instance-section")).toBeHidden({
			timeout: 20_000,
		});
		expect((await topLevelNodeIds(page)).length).toBeGreaterThanOrEqual(before);
	});

	test("10. delete shows impact, cancels cleanly, and detach-all deletes", async ({
		page,
	}) => {
		await openEditor(page);
		await createNamedComponent(page, "Promo card");
		await openComponentsPanel(page);
		const definitionId = await firstDefinitionId(page);

		await page.getByTestId(`ak-component-delete-${definitionId}`).click();
		const dialog = page.getByTestId("ak-component-delete-dialog");
		await expect(dialog).toBeVisible({ timeout: 20_000 });
		// The affected instance count is shown BEFORE anything commits.
		await expect(page.getByTestId("ak-component-delete-impact")).toBeVisible();

		// Cancel leaves the definition in place.
		await page.getByTestId("ak-component-delete-cancel").click();
		await expect(dialog).toBeHidden({ timeout: 20_000 });
		await expect(page.getByTestId("ak-component-row")).toHaveCount(1);

		// Detach-all-and-delete removes it atomically.
		await page.getByTestId(`ak-component-delete-${definitionId}`).click();
		await expect(dialog).toBeVisible({ timeout: 20_000 });
		await page.getByTestId("ak-component-delete-detach-all").click();
		await expect(page.getByTestId("ak-components-empty")).toBeVisible({
			timeout: 20_000,
		});
	});

	test("11. one undo restores the pre-capture document (§10.5)", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);
		await openLayersPanel(page);
		const before = (await topLevelNodeIds(page)).length;

		await createNamedComponent(page, "Promo card");
		await expect(async () => {
			expect((await topLevelNodeIds(page)).length).toBe(before - 1);
		}).toPass({ timeout: 20_000 });

		// Use the chrome's Undo button, not a keyboard shortcut: after a
		// dialog action focus may sit inside the canvas iframe, where
		// Ctrl+Z never reaches Puck's history (visual-editor.spec.ts
		// precedent).
		await page.getByRole("button", { name: /undo/i }).click();
		await expect(async () => {
			expect((await topLevelNodeIds(page)).length).toBe(before);
		}).toPass({ timeout: 20_000 });

		expect(pageErrors).toEqual([]);
	});
});
