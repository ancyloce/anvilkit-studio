/**
 * phase4-015 — HTML emit cost per component type.
 *
 * Measures the `emitHtml()` path for every first-party component
 * `type` string. This is the regression gate on the exporter's
 * per-node cost — a 20% regression here usually means a component-
 * specific emitter branch grew a hot loop or added a dep.
 *
 * The earlier name for this bench was `component-render` because no
 * richer React-render measurement existed. phase5-019 phase4-015
 * swapped that name over to an RTL-driven bench
 * (`component-render.bench.ts`) that renders each component through
 * @testing-library/react, and renamed this one to `component-emit`
 * so the two signals stay distinct in `baseline.json`.
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

export async function runComponentEmitBench(): Promise<BenchResult[]> {
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
				name: `component-emit:${task.name.slice(5, -1)}`,
				meanMs: task.result.latency.mean,
				hz: task.result.hz,
			},
		];
	});
}
