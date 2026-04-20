/**
 * phase4-015 — per-component render bench (lightweight variant).
 *
 * Measures the cost of the HTML exporter's `emitNode` path per
 * component type. A full RTL React render bench is the richer
 * measurement (and is what phase4-015 ultimately specifies), but
 * that requires jsdom wiring + component package imports from the
 * submodule. This variant exercises the same emitter code paths the
 * export pipeline uses — sufficient for regression detection on the
 * 11 component types, replaceable with an RTL bench later without
 * breaking the baseline schema.
 */
import { Bench } from "tinybench";

import { emitHtml, makeEmitContext } from "@anvilkit/plugin-export-html/emit-html";
import type { PageIR } from "@anvilkit/core/types";

import type { BenchResult } from "./types.js";

const COMPONENT_SAMPLES: Record<string, Record<string, unknown>> = {
	Hero: {
		headline: "Hero headline",
		description: "A hero block description.",
		linuxLabel: "Download",
		linuxHref: "https://example.com/",
	},
	Section: {
		headline: "Section",
		description: "A section body.",
	},
	Statistics: {
		title: "Stats",
		items: [{ value: "99.9%", label: "uptime" }],
	},
	BentoGrid: {
		theme: "dark",
		platform: "web",
		items: [{ title: "Card", description: "body", ctaLabel: "Go" }],
	},
	BlogList: {
		posts: [
			{
				title: "Post",
				description: "body",
				href: "https://example.com/",
			},
		],
	},
	Navbar: {
		logo: { text: "Brand" },
		items: [{ label: "Docs", href: "/docs" }],
	},
	PricingMinimal: {
		headline: "Pricing",
		plans: [{ name: "Pro", price: "$9", ctaLabel: "Buy" }],
	},
	LogoClouds: {
		title: "Brands",
	},
	Helps: {
		message: "Need help?",
		buttonLabel: "Open",
	},
};

function wrapAsPage(type: string, props: Record<string, unknown>): PageIR {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [{ id: `${type}-1`, type, props }],
		},
		assets: [],
		metadata: {},
	};
}

export async function runComponentRenderBench(): Promise<BenchResult[]> {
	const bench = new Bench({ time: 300, warmupTime: 60 });
	for (const [type, props] of Object.entries(COMPONENT_SAMPLES)) {
		const ir = wrapAsPage(type, props);
		bench.add(`emit(${type})`, () => {
			emitHtml(ir, {}, makeEmitContext());
		});
	}
	await bench.run();

	return bench.tasks.flatMap((task) => {
		if (!task.result || !task.result.latency) return [];
		return [
			{
				name: `component-render:${task.name.slice(5, -1)}`,
				meanMs: task.result.latency.mean,
				hz: task.result.hz,
			},
		];
	});
}
