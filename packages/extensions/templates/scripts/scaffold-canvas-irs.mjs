#!/usr/bin/env node
/**
 * Authors the `canvas/src/<slug>.json` CanvasIR for every starter
 * canvas template from a declarative table. Re-running overwrites
 * every file. Mirrors `scaffold-page-irs.mjs` (which does the same for
 * the Puck `@anvilkit/template-*` packages) but emits the canvas IR
 * defined in `@anvilkit/canvas-core` instead of the Puck PageIR.
 *
 * Each template is self-contained: text / rect / ellipse / line nodes
 * only, no external assets, so it loads with zero network calls and
 * validates against `CanvasIRSchema` (see the package's Vitest suite).
 *
 * Coordinates and `bounds` are expressed in the page's own `size.unit`
 * (px for screen formats, mm for print) — the canvas treats node space
 * as the page's coordinate space.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canvasSrc = join(here, "..", "canvas", "src");

const TS = "2026-05-23T00:00:00.000Z";

const tf = (x, y) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

function rect(id, x, y, w, h, z, props = {}) {
	return {
		id,
		type: "rect",
		transform: tf(x, y),
		bounds: { width: w, height: h },
		zIndex: z,
		...props,
	};
}

function ellipse(id, x, y, w, h, z, props = {}) {
	return {
		id,
		type: "ellipse",
		transform: tf(x, y),
		bounds: { width: w, height: h },
		zIndex: z,
		...props,
	};
}

function line(id, x, y, len, z, props = {}) {
	return {
		id,
		type: "line",
		transform: tf(x, y),
		bounds: { width: len, height: 0 },
		zIndex: z,
		points: [0, 0, len, 0],
		stroke: props.stroke ?? "#111827",
		...(props.strokeWidth !== undefined
			? { strokeWidth: props.strokeWidth }
			: {}),
	};
}

function text(id, x, y, w, h, str, z, props = {}) {
	return {
		id,
		type: "text",
		transform: tf(x, y),
		bounds: { width: w, height: h },
		zIndex: z,
		text: str,
		fontFamily: props.fontFamily ?? "Inter",
		fontSize: props.fontSize ?? 48,
		fill: props.fill ?? "#111827",
		...(props.fontWeight ? { fontWeight: props.fontWeight } : {}),
		...(props.align ? { align: props.align } : {}),
	};
}

/** @type {Array<{slug:string,title:string,name:string,description:string,size:object,background:object,nodes:(w:number,h:number)=>object[]}>} */
const defs = [
	{
		slug: "poster",
		title: "Event Poster",
		name: "Event Poster — 2:3",
		description:
			"Portrait poster with a top accent bar, oversized headline, and footer byline.",
		size: { width: 1080, height: 1620, unit: "px" },
		background: { kind: "solid", value: "#0f172a" },
		nodes: () => [
			rect("accent", 0, 0, 1080, 24, 1, { fill: "#f59e0b" }),
			text("eyebrow", 80, 180, 920, 60, "PRESENTING", 2, {
				fontSize: 36,
				fontWeight: "600",
				fill: "#f59e0b",
			}),
			text("title", 80, 260, 920, 440, "Design\nWithout\nLimits", 3, {
				fontSize: 140,
				fontWeight: "800",
				fill: "#ffffff",
			}),
			text(
				"subtitle",
				80,
				760,
				920,
				120,
				"A starter canvas poster you can make your own.",
				4,
				{ fontSize: 40, fill: "#cbd5e1" },
			),
			ellipse("dot", 80, 1490, 64, 64, 5, { fill: "#f59e0b" }),
			text("footer", 170, 1500, 820, 60, "anvilkit.studio", 6, {
				fontSize: 36,
				fill: "#94a3b8",
			}),
		],
	},
	{
		slug: "ig-post",
		title: "Instagram Post",
		name: "Instagram Post — Square",
		description:
			"1080×1080 square card with a centered title and dimension caption.",
		size: { width: 1080, height: 1080, unit: "px" },
		background: { kind: "solid", value: "#ffffff" },
		nodes: () => [
			rect("card", 60, 60, 960, 960, 1, { fill: "#f1f5f9", radius: 48 }),
			text("title", 140, 360, 800, 240, "Square\nPost", 2, {
				fontSize: 120,
				fontWeight: "800",
				fill: "#0f172a",
				align: "center",
			}),
			text("subtitle", 140, 620, 800, 80, "1080 × 1080", 3, {
				fontSize: 40,
				fill: "#64748b",
				align: "center",
			}),
		],
	},
	{
		slug: "ig-story",
		title: "Instagram Story",
		name: "Instagram Story — 9:16",
		description:
			"Vertical story with a color band, kicker, big headline, and swipe-up CTA.",
		size: { width: 1080, height: 1920, unit: "px" },
		background: { kind: "solid", value: "#111827" },
		nodes: () => [
			rect("band", 0, 0, 1080, 640, 1, { fill: "#6366f1" }),
			text("kicker", 80, 720, 920, 60, "STORY", 2, {
				fontSize: 40,
				fontWeight: "700",
				fill: "#a5b4fc",
			}),
			text("headline", 80, 800, 920, 420, "Tap to\nlearn more", 3, {
				fontSize: 110,
				fontWeight: "800",
				fill: "#ffffff",
			}),
			text("cta", 80, 1740, 920, 80, "Swipe up ↑", 4, {
				fontSize: 44,
				fill: "#e5e7eb",
				align: "center",
			}),
		],
	},
	{
		slug: "slide-16x9",
		title: "Content Slide",
		name: "Slide — 16:9 Content",
		description:
			"Widescreen content slide with a side rule, title, body copy, and page number.",
		size: { width: 1920, height: 1080, unit: "px" },
		background: { kind: "solid", value: "#ffffff" },
		nodes: () => [
			rect("sidebar", 0, 0, 16, 1080, 1, { fill: "#2563eb" }),
			text("title", 120, 360, 1200, 140, "Slide Title", 2, {
				fontSize: 96,
				fontWeight: "800",
				fill: "#0f172a",
			}),
			text(
				"body",
				120,
				560,
				1400,
				300,
				"Supporting copy goes here. Keep it to a few lines.",
				3,
				{ fontSize: 44, fill: "#475569" },
			),
			text("pagenum", 1760, 980, 120, 60, "01", 4, {
				fontSize: 36,
				fill: "#94a3b8",
				align: "right",
			}),
		],
	},
	{
		slug: "slide-title",
		title: "Title Slide",
		name: "Slide — 16:9 Title",
		description:
			"Centered title slide on a dark background with subtitle and accent dot.",
		size: { width: 1920, height: 1080, unit: "px" },
		background: { kind: "solid", value: "#0b1020" },
		nodes: () => [
			text("title", 260, 380, 1400, 240, "Presentation\nTitle", 1, {
				fontSize: 120,
				fontWeight: "800",
				fill: "#ffffff",
				align: "center",
			}),
			text("subtitle", 260, 720, 1400, 80, "Subtitle or author name", 2, {
				fontSize: 48,
				fill: "#93c5fd",
				align: "center",
			}),
			ellipse("dot", 928, 900, 64, 64, 3, { fill: "#3b82f6" }),
		],
	},
	{
		slug: "a4-flyer",
		title: "A4 Flyer",
		name: "Flyer — A4 (print)",
		description:
			"True A4 print flyer in millimetres at 300 DPI: red header band, headline, body, footer.",
		size: { width: 210, height: 297, unit: "mm", dpi: 300 },
		background: { kind: "solid", value: "#ffffff" },
		nodes: () => [
			rect("header", 0, 0, 210, 60, 1, { fill: "#dc2626" }),
			text("brand", 16, 22, 178, 18, "FLYER", 2, {
				fontSize: 14,
				fontWeight: "700",
				fill: "#ffffff",
			}),
			text("headline", 16, 90, 178, 60, "Big Event\nThis Friday", 3, {
				fontSize: 26,
				fontWeight: "800",
				fill: "#111827",
			}),
			text(
				"body",
				16,
				170,
				178,
				80,
				"Details about the event, the venue, and how to RSVP.",
				4,
				{ fontSize: 9, fill: "#374151" },
			),
			text("footer", 16, 275, 178, 12, "123 Main St · anvilkit.studio", 5, {
				fontSize: 7,
				fill: "#6b7280",
			}),
		],
	},
	{
		slug: "business-card",
		title: "Business Card",
		name: "Business Card — 85×55mm",
		description:
			"Standard business card in millimetres at 300 DPI: name, role, divider, contact.",
		size: { width: 85, height: 55, unit: "mm", dpi: 300 },
		background: { kind: "solid", value: "#0f172a" },
		nodes: () => [
			text("name", 8, 16, 69, 10, "Ada Lovelace", 1, {
				fontSize: 7,
				fontWeight: "700",
				fill: "#ffffff",
			}),
			text("role", 8, 27, 69, 6, "Founder & Engineer", 2, {
				fontSize: 4,
				fill: "#94a3b8",
			}),
			line("rule", 8, 38, 69, 3, { stroke: "#334155", strokeWidth: 0.5 }),
			text("contact", 8, 42, 69, 8, "hello@anvilkit.studio", 4, {
				fontSize: 3.5,
				fill: "#cbd5e1",
			}),
		],
	},
	{
		slug: "fb-cover",
		title: "Facebook Cover",
		name: "Facebook Cover — 820×312",
		description:
			"Facebook cover banner with brand title, tagline, and a circular badge.",
		size: { width: 820, height: 312, unit: "px" },
		background: { kind: "solid", value: "#1e293b" },
		nodes: () => [
			text("title", 60, 90, 700, 80, "Your Brand Here", 1, {
				fontSize: 64,
				fontWeight: "800",
				fill: "#ffffff",
			}),
			text("tag", 60, 190, 700, 50, "Tagline goes here", 2, {
				fontSize: 32,
				fill: "#94a3b8",
			}),
			ellipse("badge", 700, 110, 80, 80, 3, { fill: "#38bdf8" }),
		],
	},
	{
		slug: "twitter-header",
		title: "Profile Header",
		name: "Profile Header — 1500×500",
		description:
			"Wide profile header with a top accent band, display title, and handle line.",
		size: { width: 1500, height: 500, unit: "px" },
		background: { kind: "solid", value: "#0f172a" },
		nodes: () => [
			rect("band", 0, 0, 1500, 8, 1, { fill: "#22d3ee" }),
			text("title", 80, 180, 1000, 100, "Profile Header", 2, {
				fontSize: 88,
				fontWeight: "800",
				fill: "#ffffff",
			}),
			text("tag", 80, 300, 1000, 60, "@handle · what you do", 3, {
				fontSize: 40,
				fill: "#94a3b8",
			}),
		],
	},
	{
		slug: "presentation-section",
		title: "Section Divider",
		name: "Slide — 16:9 Section",
		description:
			"Section divider slide with a numbered eyebrow, accent bar, and chapter title.",
		size: { width: 1920, height: 1080, unit: "px" },
		background: { kind: "solid", value: "#111827" },
		nodes: () => [
			text("section", 260, 420, 1400, 60, "Section 01", 1, {
				fontSize: 44,
				fontWeight: "700",
				fill: "#f472b6",
			}),
			rect("bar", 260, 520, 80, 8, 2, { fill: "#f472b6" }),
			text("title", 260, 560, 1400, 160, "The Next Chapter", 3, {
				fontSize: 104,
				fontWeight: "800",
				fill: "#ffffff",
			}),
		],
	},
];

for (const def of defs) {
	const ir = {
		version: "1",
		id: def.slug,
		title: def.title,
		pages: [
			{
				id: `${def.slug}-1`,
				name: def.title,
				size: def.size,
				background: def.background,
				root: {
					id: `${def.slug}-root`,
					name: "Root",
					type: "group",
					transform: tf(0, 0),
					bounds: { width: def.size.width, height: def.size.height },
					zIndex: 0,
					children: def.nodes(def.size.width, def.size.height),
				},
			},
		],
		assets: {},
		metadata: { createdAt: TS, updatedAt: TS },
	};
	writeFileSync(
		join(canvasSrc, `${def.slug}.json`),
		`${JSON.stringify(ir, null, "\t")}\n`,
	);
	console.log(`wrote packages/extensions/templates/canvas/src/${def.slug}.json`);
}

console.log(`\nwrote ${defs.length} canvas templates.`);
