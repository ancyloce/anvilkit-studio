/**
 * @file M4 (PRD 0012 Beta hardening): axe pass over the NEW canvas-editor
 * surfaces — the `<CanvasWorkspace>` shell chrome, the export dialog, and a
 * context menu. Complements `e2e/a11y.spec.ts` (demo home page), whose axe
 * setup this mirrors: same tag set, `color-contrast` disabled for the same
 * WSL2/CI budget reason (contrast is validated manually in
 * `docs/a11y-baseline.md`), fail on serious/critical only.
 *
 * Serial + cold-mount headroom for the same reason as `editor-core.spec.ts`:
 * the ssr:false Konva chunk can take minutes to compile on a cold dev server;
 * only the first mount in a run pays it.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeCoreSource = readFileSync(
	require.resolve("axe-core/axe.min.js"),
	"utf8",
);

const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: 600_000 });

interface AxeViolation {
	id: string;
	impact: string;
	description: string;
	nodes: { target: string[]; html: string }[];
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
	await page.evaluate(axeCoreSource);
	const violations = await page.evaluate(async () => {
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
			iframes: false,
		});
		return results.violations;
	});
	return violations;
}

function expectNoSerious(violations: AxeViolation[]): void {
	const serious = violations.filter(
		(v) => v.impact === "serious" || v.impact === "critical",
	);
	const report = serious
		.map(
			(v) =>
				`[${v.impact}] ${v.id}: ${v.description}\n` +
				v.nodes.map((n) => `  → ${n.target.join(" > ")}`).join("\n"),
		)
		.join("\n");
	expect(serious, report).toHaveLength(0);
}

const runId = `m4-a11y-${Math.random().toString(36).slice(2, 8)}`;

async function gotoCanvas(page: Page): Promise<void> {
	await page.goto(`/studio/canvas/${runId}`);
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
	await expect(
		page.locator('[data-testid="pages-canvas"] canvas').first(),
	).toBeAttached({ timeout: 60_000 });
}

test.describe("Canvas editor accessibility — WCAG 2.1 AA (axe)", () => {
	test("workspace shell has no serious/critical violations", async ({
		page,
	}) => {
		await gotoCanvas(page);
		expectNoSerious(await runAxe(page));
	});

	test("export dialog has no serious/critical violations", async ({ page }) => {
		await gotoCanvas(page);
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible({
			timeout: 30_000,
		});
		expectNoSerious(await runAxe(page));
		await page.keyboard.press("Escape");
	});

	test("canvas context menu has no serious/critical violations", async ({
		page,
	}) => {
		await gotoCanvas(page);
		// The stage is zoom-to-fit (~162×162 at this viewport) — click at a
		// FRACTION of its box, never absolute pixels, or the click lands on
		// the inspector (see editor-core.spec.ts's atStage note).
		const box = await page
			.locator('[data-testid="pages-canvas"] canvas')
			.first()
			.boundingBox();
		if (!box) throw new Error("canvas stage not found");
		await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, {
			button: "right",
		});
		await expect(page.getByRole("menu")).toBeVisible({ timeout: 10_000 });
		expectNoSerious(await runAxe(page));
	});
});
