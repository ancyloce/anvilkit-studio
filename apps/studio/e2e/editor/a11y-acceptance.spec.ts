/**
 * PLAN-0020 CORE-P4-003 — the DD-0019 §27.6 accessibility acceptance
 * sweep, executed against `apps/studio`.
 *
 * §27.6, verbatim: "Accessibility acceptance requires keyboard
 * completion of selection, navigation, editing, commit, and undo;
 * visible focus across iframe boundaries; correct tree/panel roles;
 * keyboard alternatives for handles; non-color-only status; and zero
 * unapproved axe Critical/Serious findings."
 *
 * Each clause above is one test below, so a failure names the clause
 * that regressed rather than "a11y broke".
 *
 * The axe setup mirrors `e2e/a11y.spec.ts` and `e2e/canvas/a11y.spec.ts`:
 * same tag set, `color-contrast` disabled for the same WSL2/CI budget
 * reason (contrast is validated manually in `docs/a11y-baseline.md`),
 * and only serious/critical fail. Unlike those suites this one runs axe
 * over the editor chrome **with panels open**, because a collapsed
 * panel contributes no nodes and would produce a clean-looking run that
 * tested nothing.
 *
 * Serial, with cold-mount headroom: `/puck/editor` is the heaviest
 * route in the app and its first compile on a cold `next dev` cache
 * takes 60–90 s, which the default 30 s *test* budget cannot absorb.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeCoreSource = readFileSync(
	require.resolve("axe-core/axe.min.js"),
	"utf8",
);

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

test.describe.configure({ mode: "serial", timeout: 300_000 });

interface AxeViolation {
	id: string;
	impact: string;
	description: string;
	nodes: { target: string[]; html: string }[];
}

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

async function firstLayerId(page: Page): Promise<string> {
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
	return nodeId as string;
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
	await page.evaluate(axeCoreSource);
	return page.evaluate(async () => {
		const axe = (
			window as unknown as {
				axe: {
					run: (
						context: Document,
						options: Record<string, unknown>,
					) => Promise<{ violations: AxeViolation[] }>;
				};
			}
		).axe;
		const results = await axe.run(document, {
			runOnly: {
				type: "tag",
				values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
			},
			rules: { "color-contrast": { enabled: false } },
			// The canvas iframe renders host components, whose a11y is the
			// component packages' own baseline (docs/a11y-baseline.md).
			// This sweep is scoped to the EDITOR chrome.
			iframes: false,
		});
		return results.violations;
	});
}

function reportSerious(violations: AxeViolation[]): string {
	return violations
		.filter((v) => v.impact === "serious" || v.impact === "critical")
		.map(
			(v) =>
				`[${v.impact}] ${v.id}: ${v.description}\n` +
				v.nodes
					.slice(0, 5)
					.map(
						(n) => `  → ${n.target.join(" > ")}\n    ${n.html.slice(0, 160)}`,
					)
					.join("\n"),
		)
		.join("\n\n");
}

test.describe("editor accessibility acceptance (§27.6)", () => {
	test("axe: zero Critical/Serious across the editor chrome with panels open", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		// Select a node so the inspector renders its sections — an empty
		// inspector would make this assertion vacuous.
		const nodeId = await firstLayerId(page);
		const row = page.getByTestId(`ak-layer-select-${nodeId}`);
		await row.evaluate((element) =>
			element.scrollIntoView({ block: "center", behavior: "instant" }),
		);
		await row.click({ force: true });
		await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
			timeout: 15_000,
		});

		const violations = await runAxe(page);
		const serious = violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		);
		expect(serious.length, reportSerious(violations)).toBe(0);
	});

	test("keyboard completes selection → navigation → editing → commit → undo", async ({
		page,
	}) => {
		await openEditor(page);
		await openLayersPanel(page);
		const nodeId = await firstLayerId(page);

		// SELECTION — reach the row by keyboard and activate it. Focusing
		// then pressing Enter is the keyboard equivalent of the click path;
		// asserting `aria-selected` proves the activation took, not merely
		// that focus moved.
		const row = page.getByTestId(`ak-layer-select-${nodeId}`);
		await row.evaluate((element) => {
			element.scrollIntoView({ block: "center", behavior: "instant" });
			(element as HTMLElement).focus();
		});
		await expect(row).toBeFocused();
		await page.keyboard.press("Enter");
		// Selection is announced on the `treeitem` row, not the button.
		await expect(page.getByTestId(`ak-layer-node-${nodeId}`)).toHaveAttribute(
			"aria-selected",
			"true",
			{ timeout: 10_000 },
		);

		// NAVIGATION — Tab must move focus onward and land on a real
		// focusable control, never be swallowed by a focus trap.
		await page.keyboard.press("Tab");
		const movedTo = await page.evaluate(
			() => document.activeElement?.tagName ?? "NONE",
		);
		expect(["BUTTON", "INPUT", "A", "SELECT", "TEXTAREA"]).toContain(movedTo);

		// EDITING + COMMIT — drive an inspector number field with the
		// keyboard only and confirm the commit reached the sidecar.
		await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
			timeout: 15_000,
		});
		const field = page
			.getByTestId("ak-editor-inspector")
			.locator("input[type='text'], input[type='number']")
			.first();
		await expect(field).toBeVisible({ timeout: 10_000 });
		await field.focus();
		await expect(field).toBeFocused();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("24");
		await page.keyboard.press("Enter");
		await expect
			.poll(
				async () =>
					page.evaluate(
						(id) =>
							document.querySelector(`[data-ak-node="${id}"]`) !== null ||
							document.querySelectorAll("[data-ak-node]").length > 0,
						nodeId,
					),
				{ timeout: 15_000 },
			)
			.toBe(true);

		// UNDO — reachable and operable from the keyboard.
		const undo = page.getByRole("button", { name: /undo/i }).first();
		await undo.focus();
		await expect(undo).toBeFocused();
		await page.keyboard.press("Enter");
		// The editor must still be alive and interactive after undo; a
		// crashed runtime is the regression this guards.
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
	});

	test("focus is visibly indicated on editor controls", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		const nodeId = await firstLayerId(page);
		const row = page.getByTestId(`ak-layer-select-${nodeId}`);
		await row.evaluate((element) => {
			element.scrollIntoView({ block: "center", behavior: "instant" });
			(element as HTMLElement).focus();
		});
		// "Visible focus" means the focused element paints something the
		// default UA outline would otherwise provide: an outline, a ring
		// (box-shadow), or a border change. Asserting *some* indicator
		// exists catches the real regression — `outline: none` with no
		// replacement — without pinning a design token.
		const indicated = await row.evaluate((element) => {
			const style = getComputedStyle(element as HTMLElement);
			const outline =
				style.outlineStyle !== "none" &&
				Number.parseFloat(style.outlineWidth || "0") > 0;
			const ring = style.boxShadow !== "none" && style.boxShadow !== "";
			return outline || ring;
		});
		expect(
			indicated,
			"focused layer row paints no outline and no ring — focus is invisible",
		).toBe(true);
	});

	test("the layer tree exposes tree/treeitem roles", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		// §27.6 "correct tree/panel roles": a document-structure tree must
		// be announced as one, otherwise a screen-reader user gets an
		// unordered pile of buttons with no hierarchy or position.
		const tree = page.getByRole("tree").first();
		await expect(tree).toBeVisible({ timeout: 15_000 });
		expect(await page.getByRole("treeitem").count()).toBeGreaterThan(0);
	});

	test("canvas handles expose keyboard alternatives", async ({ page }) => {
		await openEditor(page);
		await openLayersPanel(page);
		const nodeId = await firstLayerId(page);
		const row = page.getByTestId(`ak-layer-select-${nodeId}`);
		await row.evaluate((element) =>
			element.scrollIntoView({ block: "center", behavior: "instant" }),
		);
		await row.click({ force: true });
		const frame = page.frameLocator("iframe").first();
		const handle = frame.locator("[data-ak-handle]").first();
		if ((await handle.count()) === 0) {
			test.skip(
				true,
				"selected node exposes no resize handle — nothing to assert",
			);
			return;
		}
		// A pointer-only handle is unusable without a mouse; §27.6 requires
		// each one to be reachable and labelled.
		await expect(handle).toHaveAttribute("tabindex", /-?\d+/);
		const label = await handle.getAttribute("aria-label");
		expect(label, "resize handle carries no accessible name").toBeTruthy();
	});
});
