/**
 * Shared fixtures for `pnpm bench` — a 50-block page for export/IR
 * measurements and a single-block variant for component-render
 * timings. Kept in this file (not imported from package tests) so
 * the bench harness has zero runtime coupling to vitest or fixture
 * internals, and so the workload is stable across refactors.
 */
import type { Config, Data } from "@puckeditor/core";
import type { PageIR, PageIRNode } from "@anvilkit/core/types";

function heroNode(i: number): PageIRNode {
	return {
		id: `hero-${i}`,
		type: "Hero",
		props: {
			headline: `Ship update ${i}`,
			description:
				"Deterministic HTML exports for internal release pages with a reasonably long blurb so prop strings aren't all tiny.",
			linuxLabel: "Download for Linux",
			linuxHref: `https://example.com/linux?v=${i}`,
			primaryCtaLabel: "Get started",
			primaryCtaHref: `https://example.com/start?v=${i}`,
		},
	};
}

function sectionNode(i: number): PageIRNode {
	return {
		id: `section-${i}`,
		type: "Section",
		props: {
			badgeLabel: `Chapter ${i}`,
			headline: `Section ${i}`,
			highlightedHeadline: "matters",
			description:
				"This is a synthetic section block used to give the exporter realistic text workload without relying on lorem ipsum.",
		},
	};
}

function statsNode(i: number): PageIRNode {
	return {
		id: `stats-${i}`,
		type: "Statistics",
		props: {
			title: `Stats block ${i}`,
			items: [
				{ value: "99.9%", label: "uptime" },
				{ value: "3x", label: "faster" },
				{ value: "24/7", label: "support" },
			],
		},
	};
}

function bentoNode(i: number): PageIRNode {
	return {
		id: `bento-${i}`,
		type: "BentoGrid",
		props: {
			theme: "dark",
			platform: "web",
			items: Array.from({ length: 3 }, (_, j) => ({
				title: `Card ${i}.${j}`,
				description: "A short description for the card.",
				icon: "•",
				size: "default",
				ctaLabel: "Learn more",
				ctaHref: `https://example.com/card/${i}/${j}`,
			})),
		},
	};
}

function blogNode(i: number): PageIRNode {
	return {
		id: `blog-${i}`,
		type: "BlogList",
		props: {
			posts: Array.from({ length: 4 }, (_, j) => ({
				title: `Post ${i}.${j}`,
				description: "One-line blog description.",
				href: `https://example.com/blog/${i}/${j}`,
				imageSrc: `https://example.com/img/${i}-${j}.png`,
				imageAlt: "cover",
				publishedAt: "2026-04-01",
				publishedLabel: "April 1, 2026",
			})),
		},
	};
}

const NODE_FACTORIES: ReadonlyArray<(i: number) => PageIRNode> = [
	heroNode,
	sectionNode,
	statsNode,
	bentoNode,
	blogNode,
];

/** 50-block PageIR — the reference workload for html-export + ir-roundtrip. */
export function makeFiftyBlockIR(): PageIR {
	const children: PageIRNode[] = [];
	for (let i = 0; i < 50; i += 1) {
		const factory = NODE_FACTORIES[i % NODE_FACTORIES.length];
		if (factory) children.push(factory(i));
	}
	return {
		version: "1",
		root: { id: "root", type: "__root__", props: {}, children },
		assets: [],
		metadata: { createdAt: "2026-04-19T00:00:00.000Z" },
	};
}

/** Same 50-block workload, but as Puck `Data` for the puck→IR leg. */
export function makeFiftyBlockPuckData(): Data {
	const ir = makeFiftyBlockIR();
	return {
		root: { props: {} },
		content: (ir.root.children ?? []).map((child) => ({
			type: child.type,
			props: { id: child.id, ...child.props },
		})),
	} as Data;
}

/** Minimal Puck Config covering the 5 component types the 50-block workload uses. */
export function makeFiftyBlockPuckConfig(): Config {
	const render = (() => null) as unknown as Config["components"][string]["render"];
	return {
		components: {
			Hero: { render, fields: {} },
			Section: { render, fields: {} },
			Statistics: { render, fields: {} },
			BentoGrid: { render, fields: {} },
			BlogList: { render, fields: {} },
		},
	} as Config;
}
