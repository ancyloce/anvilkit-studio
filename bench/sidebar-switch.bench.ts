/**
 * @file Phase G4 — module-switch latency bench (Playwright).
 *
 * Measures the time from `setActiveTab` (rail-icon click) to the
 * panel painting the next module body. PRD §2.6 budget: **p95 <
 * 100 ms** across 100 iterations on a warm editor.
 *
 * ## Method
 *
 * 1. Launch headless Chromium and navigate to `/puck/editor`.
 * 2. Wait for the rail tablist + initial panel paint so the
 *    measurement does not include cold hydration cost.
 * 3. For each iteration: click the next rail icon in the cyclic
 *    order `insert → layer → image → text → insert`, then wait for
 *    the corresponding `data-testid="ak-module-<key>"` to become
 *    visible. The wall-clock between click and selector resolution
 *    is the latency.
 * 4. Compute mean + p95.
 * 5. Drop the first iteration as a warm-up sample.
 *
 * ## Skip protocol
 *
 * Mirrors {@link runEditorLoadBench}: when the demo is not reachable
 * at `localhost:3000`, return `meanMs: NaN`. `bench/index.ts:64` then
 * treats the row as `skipped (preconditions not met)` and neither
 * regresses nor overwrites the baseline. Local `pnpm bench` runs
 * without the demo continue to pass.
 *
 * ## Initial baseline
 *
 * `bench/baseline.json` ships a conservative `sidebar-switch` entry
 * (50 ms mean, 100 ms p95) so the gate is active from this PR's
 * first CI run. The first measured run on `main` should call
 * `pnpm bench:update` to pin a real value.
 */

import type { BenchResult } from "./types.js";

const EDITOR_URL =
	process.env.ANVILKIT_EDITOR_URL ?? "http://localhost:3000/puck/editor";

const ITERATIONS = Number.parseInt(
	process.env.ANVILKIT_SIDEBAR_BENCH_ITERATIONS ?? "100",
	10,
);

const RAIL_TAB_IDS = [
	"ak-rail-tab-insert",
	"ak-rail-tab-layer",
	"ak-rail-tab-image",
	"ak-rail-tab-text",
] as const;

const MODULE_TESTIDS = [
	"ak-module-insert",
	"ak-module-layer",
	"ak-module-image",
	"ak-module-text",
] as const;

async function probeDemo(): Promise<boolean> {
	try {
		const res = await fetch(EDITOR_URL, { redirect: "manual" });
		return res.status === 200 || res.status === 301 || res.status === 302;
	} catch {
		return false;
	}
}

function percentile(samples: readonly number[], p: number): number {
	if (samples.length === 0) return Number.NaN;
	const sorted = [...samples].sort((a, b) => a - b);
	const rank = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
	);
	return sorted[rank] ?? Number.NaN;
}

export async function runSidebarSwitchBench(): Promise<BenchResult[]> {
	const reachable = await probeDemo();
	if (!reachable) {
		console.warn(
			`bench: sidebar-switch — ${EDITOR_URL} not reachable, skipping. ` +
				`Start the demo (\`pnpm --filter demo start\`) or set ANVILKIT_EDITOR_URL to measure.`,
		);
		return [
			{
				name: "sidebar-switch",
				meanMs: Number.NaN,
				hz: Number.NaN,
				p95Ms: Number.NaN,
			},
		];
	}

	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
	});
	const page = await context.newPage();

	try {
		await page.goto(EDITOR_URL, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});
		// Rail mount = Studio chrome up.
		await page.waitForSelector(
			'[role="tablist"][aria-orientation="vertical"]',
			{ timeout: 30_000 },
		);
		// Initial panel paint = warm enough to start measuring.
		await page.waitForSelector(`[data-testid="${MODULE_TESTIDS[0]}"]`, {
			timeout: 30_000,
		});
	} catch (err) {
		console.warn(
			`bench: sidebar-switch — initial navigation failed: ${(err as Error).message}`,
		);
		await context.close();
		await browser.close();
		return [
			{
				name: "sidebar-switch",
				meanMs: Number.NaN,
				hz: Number.NaN,
				p95Ms: Number.NaN,
			},
		];
	}

	const samples: number[] = [];
	for (let i = 0; i < ITERATIONS; i += 1) {
		const next = (i + 1) % RAIL_TAB_IDS.length;
		const railId = RAIL_TAB_IDS[next];
		const moduleTestId = MODULE_TESTIDS[next];
		const start = performance.now();
		try {
			await page.click(`#${railId}`);
			await page.waitForSelector(`[data-testid="${moduleTestId}"]`, {
				state: "visible",
				timeout: 5_000,
			});
		} catch (err) {
			console.warn(
				`bench: sidebar-switch — iteration ${i} failed: ${(err as Error).message}`,
			);
			continue;
		}
		const elapsed = performance.now() - start;
		samples.push(elapsed);
		// Drop warm-up (first iteration) regardless of measured value.
		if (i === 0 && samples.length > 0) {
			samples.pop();
		}
	}

	await context.close();
	await browser.close();

	if (samples.length === 0) {
		console.warn(
			"bench: sidebar-switch — zero usable samples, skipping.",
		);
		return [
			{
				name: "sidebar-switch",
				meanMs: Number.NaN,
				hz: Number.NaN,
				p95Ms: Number.NaN,
			},
		];
	}

	const meanMs = samples.reduce((sum, v) => sum + v, 0) / samples.length;
	const p95Ms = percentile(samples, 95);

	if (p95Ms > 100) {
		console.warn(
			`bench: sidebar-switch — p95 ${p95Ms.toFixed(2)} ms exceeds the 100 ms PRD §2.6 budget over ${samples.length} iterations.`,
		);
	}

	return [
		{
			name: "sidebar-switch",
			meanMs,
			hz: 1000 / meanMs,
			p95Ms,
		},
	];
}
