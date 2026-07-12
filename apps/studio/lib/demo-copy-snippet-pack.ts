/**
 * @file Demo Copywriting snippet pack fixture.
 *
 * Twelve sample snippets split across the two built-in categories
 * (`basic` and `brand`) the StudioSidebar `text` module renders. The
 * pack is registered into `<Studio>` via the inline plugin defined in
 * {@link ./puck-demo.ts}, which calls
 * `ctx.registerCopySnippetPack(demoCopySnippetPack)` from `onInit` and
 * unregisters on `onDestroy`.
 *
 * Locale-specific packs are out of scope for v1 (PRD §2.3) — host
 * apps choose which pack to register based on the active locale.
 */

import type { StudioCopySnippetPack } from "@anvilkit/core";

export const demoCopySnippetPack: StudioCopySnippetPack = {
	id: "demo-copy-en",
	locale: "en",
	snippets: [
		{
			id: "basic-cta",
			category: "basic",
			title: "Call to action",
			body: "Get started today and see what's possible.",
			tags: ["cta", "button", "headline"],
		},
		{
			id: "basic-hero-subtitle",
			category: "basic",
			title: "Hero subtitle",
			body: "Build, ship, and iterate faster than ever — with the tools your team already loves.",
			tags: ["hero", "subtitle", "marketing"],
		},
		{
			id: "basic-feature-headline",
			category: "basic",
			title: "Feature headline",
			body: "Everything you need. Nothing you don't.",
			tags: ["feature", "headline"],
		},
		{
			id: "basic-empty-state",
			category: "basic",
			title: "Empty state",
			body: "Nothing here yet. Add your first item to see it appear.",
			tags: ["empty", "placeholder"],
		},
		{
			id: "basic-footer-disclaimer",
			category: "basic",
			title: "Footer disclaimer",
			body: "All trademarks are property of their respective owners. Used with permission.",
			tags: ["footer", "legal", "disclaimer"],
		},
		{
			id: "basic-coming-soon",
			category: "basic",
			title: "Coming soon",
			body: "Something new is on the way. Sign up to be the first to know.",
			tags: ["announcement", "waitlist"],
		},
		{
			id: "brand-tagline",
			category: "brand",
			title: "Tagline",
			body: "The page builder for teams that ship.",
			tags: ["tagline", "brand", "headline"],
		},
		{
			id: "brand-mission",
			category: "brand",
			title: "Mission statement",
			body: "We help product teams turn ideas into polished pages without the hand-off, the meeting, or the code freeze.",
			tags: ["mission", "brand", "about"],
		},
		{
			id: "brand-social-proof",
			category: "brand",
			title: "Social proof",
			body: "Trusted by thousands of product teams to ship faster, iterate smarter, and stay on brand.",
			tags: ["social-proof", "trust"],
		},
		{
			id: "brand-pricing-promise",
			category: "brand",
			title: "Pricing promise",
			body: "Predictable pricing. No per-seat surprises. Cancel any time.",
			tags: ["pricing", "promise"],
		},
		{
			id: "brand-support-pledge",
			category: "brand",
			title: "Support pledge",
			body: "Real engineers answer real questions, usually within an hour. We hate ticket queues too.",
			tags: ["support", "promise"],
		},
		{
			id: "brand-launch-statement",
			category: "brand",
			title: "Launch statement",
			body: "Built by a small team that believes the best software gets out of your way.",
			tags: ["launch", "brand", "story"],
		},
	],
};
