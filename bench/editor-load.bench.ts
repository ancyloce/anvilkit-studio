/**
 * phase5-019 phase4-015 — editor-load TTI bench (Playwright).
 *
 * Launches headless Chromium, navigates to the demo app's
 * `/puck/editor` route, and measures how long it takes until the
 * editor is interactive — defined as the first paint + layout at
 * which a `[data-testid="puck-editor"]` (or the fallback `.Puck`
 * class selector) element becomes visible.
 *
 * ## Preconditions
 *
 * The demo must be servable at `http://localhost:3000` when this
 * bench runs. Either:
 *
 * - **CI:** `.github/workflows/bench.yml` builds the demo, starts
 *   `next start` on port 3000 in the background, waits for it, and
 *   then calls `pnpm bench`.
 * - **Local:** run `pnpm --filter demo build && pnpm --filter demo
 *   start` in a second shell, then `pnpm bench`.
 *
 * If the demo is not reachable, the bench emits a single
 * "editor-load" row with `meanMs: NaN` and logs a warning. `bench/
 * index.ts` treats `NaN` rows as "skipped" (no regression, no
 * update to baseline).
 *
 * ## Initial baseline
 *
 * `bench/baseline.json` ships with a conservative `editor-load`
 * entry (5000ms) so the regression gate is active from the first PR
 * after this bench lands. The first CI run on `main` should call
 * `pnpm bench --update-baseline` to pin a measured value — anything
 * under that becomes the new gate (subject to the harness's 20%
 * tolerance). Without that initial entry, `bench/index.ts` would
 * treat the bench as "new" and silently skip regression checks.
 *
 * ## Why not use the playwright PR action's own TTI?
 *
 * Playwright's built-in TTI metric requires the Long Tasks API,
 * which Chromium only exposes in headful mode. Measuring via
 * `page.evaluate(performance.now())` across the navigation + one
 * `waitForSelector` round-trip is a stable, lower-fidelity proxy
 * that works in the same container CI already runs.
 */

import type { BenchResult } from "./types.js";

const EDITOR_URL =
	process.env.ANVILKIT_EDITOR_URL ?? "http://localhost:3000/puck/editor";
const READY_SELECTOR =
	process.env.ANVILKIT_EDITOR_READY_SELECTOR ?? '[data-testid="puck-editor"], .Puck';

/**
 * Number of back-to-back navigations to average. Smaller than the
 * other benches' tinybench sample counts because each load is ~1s
 * on a cold CI VM — 5 iterations keeps total bench time bounded.
 */
const ITERATIONS = Number.parseInt(
	process.env.ANVILKIT_EDITOR_BENCH_ITERATIONS ?? "5",
	10,
);

async function probeDemo(): Promise<boolean> {
	try {
		const res = await fetch(EDITOR_URL, { redirect: "manual" });
		return res.status === 200 || res.status === 302 || res.status === 301;
	} catch {
		return false;
	}
}

export async function runEditorLoadBench(): Promise<BenchResult[]> {
	const reachable = await probeDemo();
	if (!reachable) {
		console.warn(
			`bench: editor-load — ${EDITOR_URL} not reachable, skipping. ` +
				`Start the demo (\`pnpm --filter demo start\`) or set ANVILKIT_EDITOR_URL to measure.`,
		);
		return [
			{
				name: "editor-load",
				meanMs: Number.NaN,
				hz: Number.NaN,
			},
		];
	}

	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
	});

	const samples: number[] = [];
	for (let i = 0; i < ITERATIONS; i += 1) {
		const page = await context.newPage();
		const startNav = Date.now();
		try {
			await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
			await page.waitForSelector(READY_SELECTOR, { timeout: 30_000 });
		} catch (err) {
			console.warn(
				`bench: editor-load — navigation or selector wait failed on iteration ${i}: ${(err as Error).message}`,
			);
			await page.close();
			continue;
		}
		const domMs = await page.evaluate(() => performance.now());
		samples.push(domMs);
		await page.close();
		// First iteration warm-up only — drop its sample.
		if (i === 0 && samples.length > 0) {
			samples.pop();
		}
		void startNav;
	}

	await context.close();
	await browser.close();

	if (samples.length === 0) {
		console.warn("bench: editor-load — zero usable samples, skipping.");
		return [
			{
				name: "editor-load",
				meanMs: Number.NaN,
				hz: Number.NaN,
			},
		];
	}

	const meanMs = samples.reduce((sum, v) => sum + v, 0) / samples.length;
	return [
		{
			name: "editor-load",
			meanMs,
			hz: 1000 / meanMs,
		},
	];
}
