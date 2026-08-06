/**
 * PLAN-0020 Phase 3 — §32.4 product acceptance against `apps/studio`
 * (CORE-P3-001/-002/-005/-006/-008/-009).
 *
 * §20's Definition of Done says milestone acceptance is "executed
 * against `apps/studio`", not only in component tests. This suite is
 * that execution: it drives the real chrome, the real inspector, and
 * the real host adapter wired in `app/puck/editor/page.tsx`.
 *
 * **Visual certification stays CI-only.** WSL2 headless screenshot
 * capture is broken on this dev box (verified in the Phase 1B close and
 * again on 2026-07-26), so this suite asserts DOM and sidecar state
 * only — the same split `visual-editor.spec.ts` and `variants.spec.ts`
 * use.
 *
 * **The AI review flow is deliberately absent.** Core owns §21.2 steps
 * 3-6 (preview, review, confirm, undo) and they are RTL-certified in
 * `react/editor/__tests__/ai-proposal-dialog.test.tsx`, but the demo has
 * nowhere to mount a trigger: `StudioProps.headerEnd` lands inside a
 * `<Popover>` whose content unmounts on close, which would destroy the
 * dialog mid-flow, and Puck `overrides` do not render because the
 * AnvilKit chrome replaces Puck's header. That is a host-extensibility
 * gap (no slot for persistent editor-aware chrome UI), not an AI one.
 * See `apps/studio/components/demo-ai-proposal.tsx` for the reference
 * implementation that is waiting on such a slot.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/** Open the Layers rail module and its inner Layers tab. */
async function openLayersPanel(page: Page): Promise<void> {
	const railTab = page.locator("#ak-rail-tab-layer");
	await railTab.waitFor({ state: "attached", timeout: 30_000 });
	await railTab.click({ force: true });
	await expect(page.getByTestId("ak-module-layer")).toBeVisible({
		timeout: 10_000,
	});
	await page.getByTestId("ak-layer-tab-layers").click({ force: true });
	await expect(page.getByTestId("ak-layer-layers")).toBeVisible({
		timeout: 10_000,
	});
}

/**
 * Select the first top-level node. The tree is virtualized and the demo
 * canvas animates, so scroll in and force the click — the
 * `visual-editor.spec.ts` precedent.
 */
async function selectFirstNode(page: Page): Promise<string> {
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
		// Selection is announced on the `treeitem` ROW, not on the name
		// button: `aria-selected` is invalid on `button` (axe
		// `aria-allowed-attr`) and moved to the row in CORE-P4-003.
		await expect(page.getByTestId(`ak-layer-node-${nodeId}`)).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 2_000 },
		);
	}).toPass({ timeout: 20_000 });
	return nodeId as string;
}

/**
 * Open one of the inspector's four tabs. The universal sections used to
 * be appended under the native fields in one column; they are now
 * grouped into style / properties / data / animation, with `properties`
 * active on mount, so every section assertion opens its tab first.
 */
async function openInspectorTab(
	page: Page,
	tab: "style" | "properties" | "data" | "animation",
): Promise<void> {
	const trigger = page.getByTestId(`ak-inspector-tab-${tab}`);
	await expect(trigger).toBeVisible({ timeout: 30_000 });
	await trigger.click();
	await expect(page.getByTestId(`ak-inspector-panel-${tab}`)).toBeVisible({
		timeout: 15_000,
	});
}

test.describe("Phase 3 surfaces — §32.4 (CORE-P3-001..009)", () => {
	// Every test here loads the editor, whose documented cold start is
	// 60-90 s under `next dev --turbopack`. Playwright's default 30 s
	// *test* budget expires before `openEditor`'s 90 s locator wait can,
	// so the describe-level override is required — the same 180 s the
	// `visual-editor` and `variants` suites use.
	test.describe.configure({ timeout: 180_000 });

	test("preview mode round-trips with a visible way back (§16)", async ({
		page,
	}) => {
		await openEditor(page);

		// Design mode is the default: interactions never run here.
		const enter = page.getByTestId("ak-preview-enter");
		await expect(enter).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId("ak-preview-active")).toBeHidden();

		await enter.click();

		// §16 requires a *visible* return-to-design control — the author's
		// handles are gone, so a hidden exit would strand them.
		const active = page.getByTestId("ak-preview-active");
		await expect(active).toBeVisible();
		await expect(active).toHaveAttribute("role", "status");
		const exit = page.getByTestId("ak-preview-exit");
		await expect(exit).toBeVisible();
		expect((await exit.innerText()).trim().length).toBeGreaterThan(0);

		await exit.click();
		await expect(page.getByTestId("ak-preview-enter")).toBeVisible();
		await expect(page.getByTestId("ak-preview-active")).toBeHidden();
	});

	test("preview mode does not survive a reload", async ({ page }) => {
		// Session-scoped on purpose: reopening the editor stuck in preview,
		// with no handles, would be a trap.
		await openEditor(page);
		await page.getByTestId("ak-preview-enter").click();
		await expect(page.getByTestId("ak-preview-active")).toBeVisible();

		await page.reload();
		await expect(page.getByTestId("ak-write-target")).toBeVisible({
			timeout: 90_000,
		});
		await expect(page.getByTestId("ak-preview-enter")).toBeVisible({
			timeout: 30_000,
		});
	});

	test("interaction and binding surfaces show honest §8.5 empty states", async ({
		page,
	}) => {
		// PLAN-0025 P3-F (user-authorized coverage move): the eight
		// authoring flows this suite used to drive (create on
		// click/hover/viewport, javascript: refusal, binding resolve,
		// broken path, §19 timeout, action families, removal, timeline)
		// ran on HOST-FABRICATED wrapper capabilities. With the
		// fabrication deleted, no demo component declares the v1
		// interaction/binding surfaces, so the sections honestly never
		// render; the flows' E2E coverage returns with the composition
		// editor's Data/Animation panels (Phase 3.5+). Their engine-level
		// behavior stays covered by core's unit suites.
		await openEditor(page);
		await openLayersPanel(page);
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
	});

	test("host pages are listed and opening one calls the adapter", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		// The navigator lives in the Pages tab of the Layers rail module.
		await page.getByTestId("ak-layer-tab-pages").click({ force: true });

		const navigator = page.getByTestId("ak-page-navigator");
		await expect(navigator).toBeVisible({ timeout: 20_000 });
		await expect(page.getByTestId("ak-page-open")).toHaveCount(2);

		await page.getByTestId("ak-page-open").nth(1).click();
		// §18: the switch goes to the host, never through Puck history.
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						(window as unknown as Record<string, unknown>).__akLastOpenedPage,
				),
			)
			.toBe("about");
	});

	test("editor sections stay hidden for a document with no selection", async ({
		page,
	}) => {
		// ED-INSPECT-002's coexistence rule at the product level: nothing
		// from Phase 3 renders until a capable node is selected.
		await openEditor(page);
		// No selection → `FieldsPanel` renders its quiet empty state, so
		// neither the tab strip nor any Phase 3 section exists.
		await expect(page.getByTestId("ak-fields-panel-empty")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("ak-inspector-tabs")).toBeHidden();
		await expect(page.getByTestId("ak-interactions-section")).toBeHidden();
		await expect(page.getByTestId("ak-bindings-section")).toBeHidden();
	});
});
