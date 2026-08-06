// @vitest-environment jsdom

/**
 * @file PLAN-0025 P2-00 — the `setData` spike that gates Phase 2
 * (§8.3, §14.6). Mounts the real `<Puck>` (0.22.4) in composition
 * mode — `Puck.Preview`, iframe disabled — over the shared §14.6 bench
 * document, then measures what the v2 write path will actually pay per
 * style commit: a functional-updater `setData` dispatch with
 * `recordHistory: true`, timed through the synchronous React flush,
 * plus the component re-render count per commit.
 *
 * The go/no-go arithmetic is `commit p50 + warm incremental compile`
 * against the one-frame budget; the compile half reuses the SAME
 * fixture as the P1-07 compiler bench so the two numbers add honestly.
 *
 * Timings are REPORTED, not gated (P1-07 precedent — the CI budget
 * gate lands with the PR-03 baseline). What IS asserted, always:
 * the functional updater really landed in `appState.data`, every Box
 * rendered at mount, and commits re-render — so the spike cannot
 * silently measure an editor that isn't editing.
 *
 * jsdom caveat (recorded in the spike report): layout/paint are absent
 * here, so these numbers are the JS-side floor of a frame, not the
 * whole frame.
 */

import "./bench-jsdom-polyfills.js";

import { performance } from "node:perf_hooks";
import type { Data, PuckAction, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
	compileDocumentAppearance,
	createAppearanceCompilerCache,
} from "../../../style-compiler/index.js";
import {
	BENCH_NODE_COUNTS,
	buildBenchConfig,
	buildBenchDocument,
	oneNodeChangeAppearance,
	withNodeAppearance,
} from "./bench-document-fixture.js";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WARMUP_COMMITS = 3;
const MEASURED_COMMITS = 20;

/** Render counter incremented by every Box render invocation. */
let boxRenders = 0;

/** `useGetPuck` smuggled out of the composition boundary. */
let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): ReactElement {
	getPuck = useGetPuck();
	return createElement("span", { hidden: true });
}

/** The probe's getter, or a loud failure if composition never mounted. */
function puckApi(): PuckApi {
	if (getPuck === null) {
		throw new Error("ApiProbe never mounted — Puck composition broke");
	}
	return getPuck();
}

const time = (run: () => void): number => {
	const start = performance.now();
	run();
	return performance.now() - start;
};

function percentile(samples: readonly number[], fraction: number): number {
	const sorted = [...samples].sort((a, b) => a - b);
	const at = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(fraction * sorted.length) - 1),
	);
	return sorted[at] ?? 0;
}

/** Read node 0's committed root display value out of live app state. */
function displayOfNodeZero(data: Data): unknown {
	const node = (
		data as unknown as {
			content: { props: Record<string, unknown> }[];
		}
	).content[0];
	const appearance = node?.props.appearance as
		| {
				targets?: {
					root?: { style?: { base?: { layout?: { display?: unknown } } } };
				};
		  }
		| undefined;
	return appearance?.targets?.root?.style?.base?.layout?.display;
}

describe("setData commit spike (P2-00)", () => {
	for (const nodeCount of BENCH_NODE_COUNTS) {
		it(`functional setData commit at ${nodeCount} nodes`, () => {
			boxRenders = 0;
			getPuck = null;
			const config = buildBenchConfig((props) => {
				boxRenders += 1;
				return createElement("div", {
					"data-ak-bench-id": props.id as string,
				});
			});
			const data = buildBenchDocument(nodeCount);

			const container = document.body.appendChild(
				document.createElement("div"),
			);
			let root: Root | undefined;
			const mountMs = time(() => {
				act(() => {
					root = createRoot(container);
					root.render(
						createElement(
							Puck,
							{
								config,
								data,
								iframe: { enabled: false },
							},
							createElement(ApiProbe),
							createElement(Puck.Preview),
						),
					);
				});
			});
			const mountRenders = boxRenders;
			expect(getPuck).not.toBeNull();
			// Every Box must have rendered at mount, or the spike is
			// measuring an empty canvas.
			expect(mountRenders).toBeGreaterThanOrEqual(nodeCount);

			const api = puckApi();
			const commit = (seed: number): number => {
				const action: PuckAction = {
					type: "setData",
					recordHistory: true,
					data: (previous: Data) =>
						withNodeAppearance(previous, 0, oneNodeChangeAppearance(seed)),
				};
				return time(() => {
					act(() => {
						api.dispatch(action);
					});
				});
			};

			for (let seed = 0; seed < WARMUP_COMMITS; seed += 1) {
				commit(seed);
			}

			const commitTimes: number[] = [];
			const renderDeltas: number[] = [];
			const before = puckApi().appState.data;
			for (let run = 0; run < MEASURED_COMMITS; run += 1) {
				const seed = WARMUP_COMMITS + run;
				const rendersBefore = boxRenders;
				commitTimes.push(commit(seed));
				renderDeltas.push(boxRenders - rendersBefore);
			}
			const after = puckApi().appState.data;

			// The functional updater really landed: the last seed's display
			// value is committed in live app state.
			const lastSeed = WARMUP_COMMITS + MEASURED_COMMITS - 1;
			expect(displayOfNodeZero(after)).toBe(
				lastSeed % 2 === 0 ? "grid" : "inline-flex",
			);
			expect(after).not.toBe(before);
			// Commits re-render: a dispatch that re-renders nothing would
			// mean the canvas ignores the write path.
			expect(renderDeltas.every((delta) => delta > 0)).toBe(true);

			// Does Puck's reducer preserve untouched node identity across a
			// one-node functional update? Checked at two depths because the
			// compiler's fragment cache keys on the appearance VALUE: props
			// containers may be cloned while appearance references survive.
			type NodeShape = { props: { appearance?: unknown } };
			const untouchedProps =
				(before as unknown as { content: NodeShape[] }).content[1]?.props ===
				(after as unknown as { content: NodeShape[] }).content[1]?.props;
			const untouchedAppearance =
				(before as unknown as { content: NodeShape[] }).content[1]?.props
					.appearance ===
				(after as unknown as { content: NodeShape[] }).content[1]?.props
					.appearance;

			// The compile half of the frame under REAL pipeline conditions:
			// prime the cache with one reducer output, dispatch once more,
			// and compile the next reducer output — identity survival is
			// whatever Puck's reducer actually provides, not what our own
			// pure updater would preserve.
			const cache = createAppearanceCompilerCache();
			compileDocumentAppearance({ data: after, config, cache });
			commit(lastSeed + 1);
			const final = puckApi().appState.data;
			const incrementalCompileMs = time(() => {
				compileDocumentAppearance({ data: final, config, cache });
			});

			const p50 = percentile(commitTimes, 0.5);
			const p95 = percentile(commitTimes, 0.95);
			const max = Math.max(...commitTimes);
			const rendersPerCommit = percentile(renderDeltas, 0.5);
			console.log(
				`[setdata-spike] nodes=${nodeCount} mount=${mountMs.toFixed(1)}ms mountRenders=${mountRenders} ` +
					`commit p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms ` +
					`renders/commit=${rendersPerCommit} untouchedPropsIdentity=${untouchedProps} ` +
					`untouchedAppearanceIdentity=${untouchedAppearance} ` +
					`incrementalCompile=${incrementalCompileMs.toFixed(1)}ms ` +
					`combined~=${(p50 + incrementalCompileMs).toFixed(1)}ms`,
			);

			act(() => {
				root?.unmount();
			});
			container.remove();
		});
	}
});
