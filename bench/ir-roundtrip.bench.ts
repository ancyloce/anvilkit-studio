/**
 * phase4-015 — IR round-trip bench.
 *
 * Measures `puckDataToIR → irToPuckData` latency on the 50-block
 * reference workload. The round-trip covers every field Anvilkit
 * persists, so regressions here almost always mean transform cost
 * is leaking into editor interactions.
 */
import { Bench } from "tinybench";

import { irToPuckData, puckDataToIR } from "@anvilkit/ir";

import type { BenchResult } from "./types.js";
import {
	makeFiftyBlockIR,
	makeFiftyBlockPuckConfig,
	makeFiftyBlockPuckData,
} from "./fixtures.js";

export async function runIrRoundtripBench(): Promise<BenchResult> {
	const puckData = makeFiftyBlockPuckData();
	const puckConfig = makeFiftyBlockPuckConfig();
	const irFixture = makeFiftyBlockIR();

	const bench = new Bench({ time: 500, warmupTime: 100 });
	bench.add("puckDataToIR(50-block)", () => {
		puckDataToIR(puckData, puckConfig);
	});
	bench.add("irToPuckData(50-block)", () => {
		irToPuckData(irFixture);
	});
	bench.add("round-trip(50-block)", () => {
		const ir = puckDataToIR(puckData, puckConfig);
		irToPuckData(ir);
	});
	await bench.run();

	const rtTask = bench.tasks.find((t) => t.name.startsWith("round-trip"));
	const roundtrip = rtTask?.result;
	if (!roundtrip) {
		console.error("ir-roundtrip: task produced no result", {
			taskFound: Boolean(rtTask),
			error: (rtTask as unknown as { result?: { error?: unknown } })?.result?.error,
		});
		throw new Error("ir-roundtrip bench produced no result");
	}
	if (!roundtrip.latency) {
		console.error("ir-roundtrip: result missing latency", {
			keys: Object.keys(roundtrip),
			hasError: "error" in roundtrip,
			error: (roundtrip as { error?: unknown }).error,
		});
		throw new Error("ir-roundtrip bench result missing latency — task errored?");
	}

	return {
		name: "ir-roundtrip",
		meanMs: roundtrip.latency.mean,
		hz: roundtrip.hz,
	};
}
