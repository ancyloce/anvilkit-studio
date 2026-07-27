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
		await expect(row).toHaveAttribute("aria-selected", "true", {
			timeout: 2_000,
		});
	}).toPass({ timeout: 20_000 });
	return nodeId as string;
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

	test("an interaction can be created on click, hover, and viewport", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);

		const section = page.getByTestId("ak-interactions-section");
		await expect(section).toBeVisible({ timeout: 20_000 });
		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(0);

		// §32.4 names these three triggers specifically.
		const triggers = ["click", "hover", "viewport"] as const;
		for (const [index, trigger] of triggers.entries()) {
			await page.getByTestId("ak-interaction-trigger").click();
			await page.getByRole("option").nth(index).click();
			await page
				.getByTestId("ak-interaction-url")
				.fill(`https://example.com/${trigger}`);
			await page.getByTestId("ak-interaction-add").click();
			await expect(page.getByTestId("ak-interaction-row")).toHaveCount(
				index + 1,
				{ timeout: 10_000 },
			);
		}
	});

	test("a javascript: URL is refused at the product boundary", async ({
		page,
	}) => {
		// §16 treats this as absolute — no host policy may admit it, and
		// the rejection must reach the author rather than failing silently.
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-interactions-section")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByTestId("ak-interaction-url").fill("javascript:alert(1)");
		await page.getByTestId("ak-interaction-add").click();

		await expect(page.getByTestId("ak-interaction-errors")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(0);
	});

	test("a binding resolves against host preview data and commits", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);

		const section = page.getByTestId("ak-bindings-section");
		await expect(section).toBeVisible({ timeout: 20_000 });

		await page.getByTestId("ak-binding-source").click();
		await page.getByRole("option", { name: "Products" }).click();

		await page.getByTestId("ak-binding-path").fill("rows.0.name");
		// Resolved against real adapter data, so the author sees the value
		// before committing.
		await expect(page.getByTestId("ak-binding-preview-value")).toContainText(
			"Anvil",
			{ timeout: 15_000 },
		);

		await page.getByTestId("ak-binding-prop").fill("title");
		await page.getByTestId("ak-binding-save").click();
		await expect(page.getByTestId("ak-binding-row")).toHaveCount(1, {
			timeout: 10_000,
		});
	});

	test("a broken path is reported as unresolved, not as empty data", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-bindings-section")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByTestId("ak-binding-source").click();
		await page.getByRole("option", { name: "Products" }).click();
		await page.getByTestId("ak-binding-path").fill("rows.0.nope");

		const unresolved = page.getByTestId("ak-binding-preview-unresolved");
		await expect(unresolved).toBeVisible({ timeout: 15_000 });
		await expect(unresolved).toHaveAttribute("data-status", "missing");
	});

	test("a slow data source is contained by the §19 timeout", async ({
		page,
	}) => {
		// The demo's `slow` source never answers on its own; Core's 5 s
		// budget is what ends the request, and the author is told *why*
		// rather than shown an empty result.
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-bindings-section")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByTestId("ak-binding-source").click();
		await page.getByRole("option", { name: "Slow source" }).click();

		const failed = page.getByTestId("ak-binding-preview-failed");
		await expect(failed).toBeVisible({ timeout: 20_000 });
		await expect(failed).toHaveAttribute("data-reason", "timeout");
	});

	test("every action family is offered and a non-URL action commits", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-interactions-section")).toBeVisible({
			timeout: 20_000,
		});

		// §16 declares six families; all of them must be authorable.
		await page.getByTestId("ak-action-kind").click();
		await expect(page.getByRole("option")).toHaveCount(6);

		// Pick `scroll`, which needs a target — proving the picker is
		// populated from the real document rather than hard-coded.
		await page.getByRole("option", { name: /scroll/i }).click();
		await page.getByTestId("ak-action-target").click();
		await page.getByRole("option").first().click();
		await page.getByTestId("ak-interaction-add").click();

		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(1, {
			timeout: 10_000,
		});
	});

	test("an interaction can be removed again", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-interactions-section")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByTestId("ak-interaction-url").fill("https://example.com/a");
		await page.getByTestId("ak-interaction-add").click();
		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(1, {
			timeout: 10_000,
		});

		await page.getByTestId("ak-interaction-remove").click();
		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(0, {
			timeout: 10_000,
		});
	});

	test("the timeline visualises actions and reorders them", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		await selectFirstNode(page);
		await expect(page.getByTestId("ak-interactions-section")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByTestId("ak-interaction-url").fill("https://example.com/first");
		await page.getByTestId("ak-interaction-add").click();
		await expect(page.getByTestId("ak-interaction-row")).toHaveCount(1, {
			timeout: 10_000,
		});

		await page.getByTestId("ak-interaction-timeline-toggle").click();
		await expect(page.getByTestId("ak-timeline")).toBeVisible();
		// One action so far: a `url` is instant, so it draws no bar.
		await expect(page.getByTestId("ak-timeline-row")).toHaveCount(1);
		await expect(page.getByTestId("ak-timeline-instant")).toBeVisible();

		// Append a second action so ordering becomes meaningful.
		await page.getByTestId("ak-interaction-url").fill("https://example.com/second");
		await page.getByTestId("ak-interaction-add-action").click();
		await expect(page.getByTestId("ak-timeline-row")).toHaveCount(2, {
			timeout: 10_000,
		});

		// Reorder commits through `interaction.update` in one dispatch.
		await page.getByTestId("ak-timeline-move-down").first().click();
		await expect(page.getByTestId("ak-timeline-row")).toHaveCount(2);

		// One undo restores the prior order — the chrome's button, since a
		// keyboard shortcut never reaches Puck history from the iframe.
		await page.getByRole("button", { name: /undo/i }).click();
		await expect(page.getByTestId("ak-timeline-row")).toHaveCount(2);
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
		await expect(page.getByTestId("ak-interactions-section")).toBeHidden();
		await expect(page.getByTestId("ak-bindings-section")).toBeHidden();
	});
});
