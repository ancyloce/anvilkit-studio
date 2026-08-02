/**
 * AI proposal review — DD-0019 §21.2 / §32.4 (CORE-P3-008).
 *
 * ### Why this file did not exist before
 *
 * Core owned steps 3–6 of §21.2 (preview, review, confirm, undo) and
 * `apps/studio/components/demo-ai-proposal.tsx` supplied step 2
 * deterministically, but the demo had **nowhere to render it**: the
 * only host seam inside the editor's provider tree was
 * `StudioProps.headerEnd`, which lands in the system menu's
 * `<Popover>` — lazy content that unmounts when the popover closes,
 * destroying the review dialog mid-flow. The scenario was therefore
 * unreachable and this suite could not exist.
 *
 * `StudioProps.editorSlot` (CORE-P3-008) is the fix: a persistent
 * mount point inside the editor providers, beside the `<Puck>`
 * subtree. `page.tsx` renders `DemoAiProposal` there, so the flow is
 * now a real user workflow and is certified here.
 *
 * The proposal is deterministic on purpose — it locks the current
 * selection. The subject under test is the **review gate**, not a
 * model; a nondeterministic proposal would make this flaky while
 * testing nothing extra.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

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

async function firstNodeId(page: Page): Promise<string> {
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
	expect(ids.length).toBeGreaterThan(0);
	return ids[0] as string;
}

async function selectFirstNode(page: Page): Promise<string> {
	const nodeId = await firstNodeId(page);
	const row = page.getByTestId(`ak-layer-select-${nodeId}`);
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
	return nodeId;
}

test.describe("AI proposal review (§21.2, §32.4)", () => {
	test.describe.configure({ timeout: 240_000 });

	test("the host slot is mounted and persistent, not inside a popover", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);

		// Present in the DOM without opening any menu — the property
		// `headerEnd` could never provide.
		const trigger = page.getByTestId("demo-ai-propose");
		await expect(trigger).toBeVisible({ timeout: 30_000 });

		// It survives opening and closing chrome menus.
		await openLayersPanel(page);
		await expect(trigger).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test("propose → review → confirm applies the change, undoable in one step", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);
		await openLayersPanel(page);
		const nodeId = await selectFirstNode(page);

		// The trigger is disabled with nothing selected and enabled now.
		const trigger = page.getByTestId("demo-ai-propose");
		await expect(trigger).toBeEnabled({ timeout: 20_000 });
		await trigger.click();

		// The review dialog is the gate: nothing has been applied yet.
		const dialog = page.getByTestId("ak-ai-proposal-dialog");
		await expect(dialog).toBeVisible({ timeout: 20_000 });

		await page.getByTestId("ak-ai-proposal-confirm").click();
		await expect(dialog).toBeHidden({ timeout: 20_000 });

		// The proposal locks the selection; the row's lock toggle
		// announces it through `aria-pressed`.
		const lockToggle = page.getByTestId(`ak-layer-lock-${nodeId}`);
		await expect(lockToggle).toHaveAttribute("aria-pressed", "true", {
			timeout: 20_000,
		});

		// Confirmed proposals are undoable through normal history.
		await page.getByRole("button", { name: /undo/i }).click();
		await expect(lockToggle).toHaveAttribute("aria-pressed", "false", {
			timeout: 20_000,
		});

		expect(pageErrors).toEqual([]);
	});

	test("dismissing the review applies nothing", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		const nodeId = await selectFirstNode(page);

		await page.getByTestId("demo-ai-propose").click();
		const dialog = page.getByTestId("ak-ai-proposal-dialog");
		await expect(dialog).toBeVisible({ timeout: 20_000 });
		await page.getByTestId("ak-ai-proposal-cancel").click();
		await expect(dialog).toBeHidden({ timeout: 20_000 });

		await expect(page.getByTestId(`ak-layer-lock-${nodeId}`)).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});
});
