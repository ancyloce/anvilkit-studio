/**
 * phase5-012 — IR diff bench.
 *
 * Measures `diffIR()` latency on a 100-node page where the second IR
 * introduces 10 prop changes, 2 adds, and 1 remove. The bench runs
 * 10 timed iterations and reports the median in `meanMs`.
 */
import { performance } from "node:perf_hooks";

import type { PageIR, PageIRNode } from "@anvilkit/core/types";
import { diffIR } from "@anvilkit/plugin-version-history";

import type { BenchResult } from "./types.js";

interface MutableBenchNode {
	id: string;
	type: string;
	props: Record<string, unknown>;
	children?: MutableBenchNode[];
}

interface MutableBenchPageIR {
	version: "1";
	root: MutableBenchNode;
	assets: unknown[];
	metadata: Record<string, unknown>;
}

export async function runIrDiffBench(): Promise<BenchResult> {
	const before = makeHundredNodeIR();
	const after = mutateHundredNodeIR(before);
	const samples: number[] = [];

	for (let iteration = 0; iteration < 10; iteration += 1) {
		const start = performance.now();
		diffIR(before, after);
		samples.push(performance.now() - start);
	}

	samples.sort((left, right) => left - right);
	const medianMs = (samples[4]! + samples[5]!) / 2;
	if (medianMs >= 50) {
		throw new Error(`ir-diff median ${medianMs.toFixed(3)}ms exceeds 50ms`);
	}

	return {
		name: "ir-diff",
		meanMs: medianMs,
		hz: medianMs > 0 ? 1000 / medianMs : Number.POSITIVE_INFINITY,
	};
}

function makeHundredNodeIR(): PageIR {
	const sections: PageIRNode[] = [];

	for (let sectionIndex = 0; sectionIndex < 9; sectionIndex += 1) {
		const children: PageIRNode[] = [];
		for (let itemIndex = 0; itemIndex < 10; itemIndex += 1) {
			children.push({
				id: `item-${sectionIndex}-${itemIndex}`,
				type: "Card",
				props: {
					title: `Card ${sectionIndex}-${itemIndex}`,
					order: itemIndex,
					config: {
						accent: itemIndex % 2 === 0,
						section: sectionIndex,
					},
				},
			});
		}

		sections.push({
			id: `section-${sectionIndex}`,
			type: "Section",
			props: {
				title: `Section ${sectionIndex}`,
			},
			children,
		});
	}

	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {
				title: "IR diff bench",
			},
			children: sections,
		},
		assets: [],
		metadata: {},
	};
}

function mutateHundredNodeIR(ir: PageIR): PageIR {
	const next = structuredClone(ir) as MutableBenchPageIR;
	const sections = next.root.children ?? [];

	for (let index = 0; index < 10; index += 1) {
		const section = sections[Math.floor(index / 5)];
		const card = section?.children?.[index % 5];
		if (!card) {
			continue;
		}

		card.props = {
			...card.props,
			title: `Updated ${index}`,
			flag: index % 2 === 0,
		};
	}

	sections[0]?.children?.splice(2, 0, {
		id: "item-0-extra",
		type: "Card",
		props: {
			title: "Extra 0",
			order: 200,
		},
	});
	sections[1]?.children?.splice(5, 0, {
		id: "item-1-extra",
		type: "Card",
		props: {
			title: "Extra 1",
			order: 201,
		},
	});
	sections[2]?.children?.splice(0, 1);

	return next;
}
