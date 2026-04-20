/**
 * phase4-015 — HTML export throughput bench.
 *
 * Measures how long `emitHtml()` takes on a 50-block reference page
 * and the byte size of the emitted HTML. Regressions above the gate
 * threshold (20% on `mean`, 10% on `bytes`) fail CI.
 */
import { Bench } from "tinybench";

import { emitHtml, makeEmitContext } from "@anvilkit/plugin-export-html/emit-html";

import type { BenchResult } from "./types.js";
import { makeFiftyBlockIR } from "./fixtures.js";

export async function runHtmlExportBench(): Promise<BenchResult> {
	const ir = makeFiftyBlockIR();
	let lastSize = 0;

	const bench = new Bench({ time: 500, warmupTime: 100 });
	bench.add("emitHtml(50-block IR)", () => {
		const ctx = makeEmitContext();
		const { html } = emitHtml(ir, {}, ctx);
		lastSize = html.length;
	});
	await bench.run();

	const task = bench.tasks[0]?.result;
	if (!task || !task.latency) {
		const err = (task as { error?: unknown } | undefined)?.error;
		throw new Error(
			`html-export bench produced no result${err ? `: ${String(err)}` : ""}`,
		);
	}

	return {
		name: "html-export",
		meanMs: task.latency.mean,
		hz: task.hz,
		bytes: lastSize,
	};
}
