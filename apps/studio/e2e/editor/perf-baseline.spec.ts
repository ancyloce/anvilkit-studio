/**
 * PLAN-0020 CORE-P4-001 — the **browser half** of the DD-0019 §28
 * performance harness.
 *
 * §28's table mixes engine latency with browser-observable latency.
 * The seven engine rows are gated deterministically by
 * `packages/runtime/core/src/testing/editor/__tests__/editor-perf.bench.ts`
 * (`pnpm --filter @anvilkit/core bench:editor`). The three rows that
 * only exist in front of a real renderer live here:
 *
 * | §28 row | metric id |
 * |---|---|
 * | Studio interactive, excluding host fetch | `studio.interactive` |
 * | Selection feedback p95 | `selection.feedback` |
 * | Gesture frame p95 | `gesture.frame` |
 *
 * ### Why these are trend-captured, not gated by default
 *
 * §28 states its budgets for "Chromium **production builds**". This
 * harness drives `next dev`, where every interaction additionally pays
 * on-demand compilation, unminified React, and dev-only double
 * rendering. Gating a dev-server number against a production budget
 * measures the harness, not the editor — so budgets are opt-in via
 * `ANVILKIT_PERF_ENFORCE=1`, to be switched on by a production-build
 * E2E job. Until then the numbers are attached as a JSON artifact in
 * the same shape the engine harness emits, so both halves trend
 * together.
 *
 * The measured node count is the demo document, not a §14 1k/10k
 * profile — recorded honestly in the artifact rather than implied.
 */

import { expect, type Page, test } from "@playwright/test";

const RUNS = 20;
const ENFORCE = process.env.ANVILKIT_PERF_ENFORCE === "1";

/** §28 budgets for the browser rows, at 1k nodes. */
const BUDGETS_MS = {
	"studio.interactive": 1_500,
	"selection.feedback": 50,
	"gesture.frame": 16.7,
} as const;

interface Sample {
	readonly median: number;
	readonly p95: number;
	readonly runs: number;
}

/** Nearest-rank p95, matching the engine harness's `summarizeSamples`. */
function summarize(samples: readonly number[]): Sample {
	if (samples.length === 0) {
		return { median: 0, p95: 0, runs: 0 };
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const median =
		sorted.length % 2 === 0
			? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
			: (sorted[mid] as number);
	const rank = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
	);
	return { median, p95: sorted[rank] as number, runs: sorted.length };
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

test.describe("editor performance (§28 browser rows)", () => {
	// `openEditor` alone waits up to 90 s for the lazy editor chunk on a
	// cold `next dev` cache; the default 30 s *test* budget expires
	// first and reports a misleading "element not found".
	test.describe.configure({ timeout: 300_000 });

	test("captures §28 browser-row baselines (20-run medians)", async ({
		page,
	}, testInfo) => {
		const metrics: Record<string, Sample & { budgetMs: number }> = {};

		// --- Studio interactive -------------------------------------------
		// Measured to the write-target toolbar, the editor-on beacon (lazy
		// chunk loaded + responsive controller installed). Only one sample
		// is available per page load, so this row reports a single
		// observation rather than a distribution — stated, not disguised.
		const navigationStart = Date.now();
		await page.goto("/puck/editor?editor=1&collab=0");
		await expect(page.getByTestId("ak-write-target")).toBeVisible({
			timeout: 90_000,
		});
		const interactiveMs = Date.now() - navigationStart;
		metrics["studio.interactive"] = {
			median: interactiveMs,
			p95: interactiveMs,
			runs: 1,
			budgetMs: BUDGETS_MS["studio.interactive"],
		};

		const frame = page.frameLocator("iframe").first();
		await expect(frame.locator("[data-ak-node]").first()).toBeVisible({
			timeout: 30_000,
		});
		const nodeCount = await frame
			.locator("[data-ak-node]")
			.count()
			.catch(() => 0);

		// --- Selection feedback -------------------------------------------
		await openLayersPanel(page);
		// Alternating targets forces a real selection change per run; a
		// repeated click on the already-selected row would measure a no-op.
		const targets = ["navbar-primary", "hero-primary"];
		const selectionSamples: number[] = [];
		for (let run = 0; run < RUNS; run += 1) {
			const row = page.getByTestId(`ak-layer-select-${targets[run % 2]}`);
			// Virtualized rows can sit outside the viewport; scroll before
			// timing so the measurement covers selection, not scrolling.
			await row.evaluate((element) =>
				element.scrollIntoView({ block: "center", behavior: "instant" }),
			);
			const startedAt = Date.now();
			await row.click({ force: true });
			await page
				.getByTestId("ak-editor-inspector")
				.waitFor({ state: "visible" });
			selectionSamples.push(Date.now() - startedAt);
		}
		metrics["selection.feedback"] = {
			...summarize(selectionSamples),
			budgetMs: BUDGETS_MS["selection.feedback"],
		};

		// --- Gesture frame -------------------------------------------------
		// Frame deltas are sampled inside the canvas iframe, which is where
		// the overlay handles and their rAF work live; sampling the parent
		// window would time a document that does not repaint during a
		// gesture.
		const gestureSamples = await measureGestureFrames(page);
		if (gestureSamples.length > 0) {
			metrics["gesture.frame"] = {
				...summarize(gestureSamples),
				budgetMs: BUDGETS_MS["gesture.frame"],
			};
		}

		const artifact = {
			hardwareClass:
				process.env.ANVILKIT_BENCH_HW ??
				(process.env.CI === "true" ? "ci-unknown" : "local"),
			capturedAt: new Date().toISOString(),
			harness: "next dev (not a §28 production build)",
			enforced: ENFORCE,
			documentNodeCount: nodeCount,
			metrics: Object.entries(metrics).map(([id, sample]) => ({
				id,
				profile: "demo",
				budgetLabel: id,
				budgetMs: ENFORCE ? sample.budgetMs : null,
				median: sample.median,
				p95: sample.p95,
				runs: sample.runs,
			})),
		};
		await testInfo.attach("editor-perf-browser.json", {
			body: JSON.stringify(artifact, null, 2),
			contentType: "application/json",
		});

		if (ENFORCE) {
			const violations = Object.entries(metrics)
				.filter(([, sample]) => sample.p95 > sample.budgetMs)
				.map(
					([id, sample]) =>
						`${id}: p95 ${sample.p95.toFixed(2)} ms exceeds §28 budget ${sample.budgetMs} ms`,
				);
			expect(violations).toEqual([]);
			return;
		}

		// Trend mode: only a collapse (an order of magnitude past budget)
		// fails, so the capture stays useful without going flaky on a dev
		// server. The real gate is the engine harness plus, once a
		// production-build job exists, ANVILKIT_PERF_ENFORCE.
		expect(metrics["selection.feedback"]?.median ?? 0).toBeLessThan(5_000);
		expect(metrics["studio.interactive"]?.median ?? 0).toBeLessThan(120_000);
	});
});

/**
 * Drive a real resize gesture while sampling rAF deltas inside the
 * canvas iframe. Returns an empty array when the selected node exposes
 * no resize handle, so the metric is simply absent rather than faked.
 */
async function measureGestureFrames(page: Page): Promise<number[]> {
	const frame = page.frameLocator("iframe").first();
	const handle = frame.locator('[data-ak-handle="resize-s"]');
	if ((await handle.count()) === 0) {
		return [];
	}
	const box = await handle.boundingBox();
	if (box === null) {
		return [];
	}

	await handle.evaluate(() => {
		const store: number[] = [];
		(window as unknown as { __akFrameDeltas: number[] }).__akFrameDeltas =
			store;
		let previous = performance.now();
		const tick = (): void => {
			const now = performance.now();
			store.push(now - previous);
			previous = now;
			(window as unknown as { __akFrameRaf: number }).__akFrameRaf =
				requestAnimationFrame(tick);
		};
		(window as unknown as { __akFrameRaf: number }).__akFrameRaf =
			requestAnimationFrame(tick);
	});

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// Many small steps: one large jump would produce a single frame and
	// no distribution to take a p95 over.
	for (let step = 1; step <= 30; step += 1) {
		await page.mouse.move(
			box.x + box.width / 2,
			box.y + box.height / 2 + step * 2,
		);
	}
	await page.mouse.up();

	return handle.evaluate(() => {
		const win = window as unknown as {
			__akFrameDeltas?: number[];
			__akFrameRaf?: number;
		};
		if (win.__akFrameRaf !== undefined) {
			cancelAnimationFrame(win.__akFrameRaf);
		}
		// Drop the first sample: it spans the gap between installing the
		// loop and the gesture actually starting.
		return (win.__akFrameDeltas ?? []).slice(1);
	});
}
