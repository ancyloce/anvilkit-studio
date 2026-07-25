/**
 * CORE-P1B-012 — §28 perf-CI baseline-capture SKELETON: 20-run
 * medians over fixed interactions, attached as a JSON artifact so CI
 * can trend them from Phase 1B onward. Ceilings here are deliberately
 * generous (dev-server + WSL noise); the hard budgets land with the
 * CORE-P4-001 harness hardening.
 */

import { expect, test } from "@playwright/test";

const RUNS = 20;

function median(samples: readonly number[]): number {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

test("selection + inspector latency baselines (20-run medians)", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	await page.goto("/puck/editor?editor=1&collab=0");
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
	const frame = page.frameLocator("iframe").first();
	await expect(frame.locator("[data-ak-node]").first()).toBeVisible({
		timeout: 30_000,
	});
	// Selection rides the Layers rows (the repo's stable selection
	// path); alternating targets forces a full selection change per run.
	const railTab = page.locator("#ak-rail-tab-layer");
	await railTab.waitFor({ state: "attached", timeout: 30_000 });
	await railTab.click({ force: true });
	await expect(page.getByTestId("ak-module-layer")).toBeVisible({
		timeout: 10_000,
	});
	// Layer rows live in the module's Layers tab (Pages is the default).
	await page.getByTestId("ak-layer-tab-layers").click({ force: true });
	await expect(page.getByTestId("ak-layer-layers")).toBeVisible({
		timeout: 10_000,
	});
	const targets = ["navbar-primary", "hero-primary"];

	const selectionSamples: number[] = [];
	for (let run = 0; run < RUNS; run += 1) {
		const row = page.getByTestId(`ak-layer-select-${targets[run % 2]}`);
		const startedAt = Date.now();
		await row.click({ force: true });
		await page.getByTestId("ak-editor-inspector").waitFor({ state: "visible" });
		selectionSamples.push(Date.now() - startedAt);
	}

	const baselines = {
		capturedAt: new Date().toISOString(),
		runs: RUNS,
		medians: { selectionToInspectorMs: median(selectionSamples) },
		samples: { selectionToInspectorMs: selectionSamples },
	};
	await testInfo.attach("editor-perf-baselines.json", {
		body: JSON.stringify(baselines, null, 2),
		contentType: "application/json",
	});
	// Generous ceiling: regression trending is CI's job, not this gate.
	expect(median(selectionSamples)).toBeLessThan(5000);
});
