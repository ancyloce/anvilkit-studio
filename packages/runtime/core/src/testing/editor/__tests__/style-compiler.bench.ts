/**
 * @file PLAN-0025 P1-07 — compiler benchmarks at the §14.6 node
 * counts (50 / 500 / 2000): cold compile, warm (cached) compile, and
 * one-node incremental change. Timings are REPORTED, not gated — the
 * CI budget gate lands with the PR-03 baseline once runner variance
 * is characterized. What IS asserted, always: cached output stays
 * byte-identical to cold output (caching may never alter results),
 * so the bench cannot pass by weakening pure-function coverage.
 */

import { performance } from "node:perf_hooks";
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

const config = buildBenchConfig();

const time = (run: () => void): number => {
	const start = performance.now();
	run();
	return performance.now() - start;
};

describe("style-compiler benchmarks (P1-07)", () => {
	for (const nodeCount of BENCH_NODE_COUNTS) {
		it(`cold vs warm at ${nodeCount} nodes — cache is output-transparent`, () => {
			const data = buildBenchDocument(nodeCount);
			const cache = createAppearanceCompilerCache();

			let cold: ReturnType<typeof compileDocumentAppearance> | undefined;
			const coldMs = time(() => {
				cold = compileDocumentAppearance({ data, config, cache });
			});
			let warm: ReturnType<typeof compileDocumentAppearance> | undefined;
			const warmMs = time(() => {
				warm = compileDocumentAppearance({ data, config, cache });
			});
			const uncached = compileDocumentAppearance({ data, config });

			expect(warm?.css).toBe(uncached.css);
			expect(warm?.fingerprint).toBe(cold?.fingerprint);
			expect(cold?.styledNodeIds).toHaveLength(nodeCount);

			// One-node incremental change: shallow-clone so every OTHER
			// node's appearance keeps identity (cache hit); only node 0
			// gets a new appearance object and recompiles.
			const mutated = withNodeAppearance(data, 0, oneNodeChangeAppearance(0));
			const incrementalMs = time(() => {
				compileDocumentAppearance({ data: mutated, config, cache });
			});

			console.log(
				`[style-compiler bench] nodes=${nodeCount} cold=${coldMs.toFixed(1)}ms warm=${warmMs.toFixed(1)}ms one-node-change=${incrementalMs.toFixed(1)}ms`,
			);
		});
	}
});
