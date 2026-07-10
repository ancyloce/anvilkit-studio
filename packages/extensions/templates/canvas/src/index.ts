import type { CanvasIR } from "@anvilkit/canvas-core";
import a4Flyer from "./a4-flyer.json" with { type: "json" };
import businessCard from "./business-card.json" with { type: "json" };
import fbCover from "./fb-cover.json" with { type: "json" };
import igPost from "./ig-post.json" with { type: "json" };
import igStory from "./ig-story.json" with { type: "json" };
import poster from "./poster.json" with { type: "json" };
import presentationSection from "./presentation-section.json" with {
	type: "json",
};
import slide16x9 from "./slide-16x9.json" with { type: "json" };
import slideTitle from "./slide-title.json" with { type: "json" };
import twitterHeader from "./twitter-header.json" with { type: "json" };

/**
 * A starter canvas design: its slug, a display name, a one-line blurb,
 * and the {@link CanvasIR} itself. The `ir` is authored as committed
 * JSON (see `../../scripts/scaffold-canvas-irs.mjs`) and validates
 * against `CanvasIRSchema` — enforced by the package's Vitest suite.
 */
export interface CanvasTemplate {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly ir: CanvasIR;
}

/**
 * The ten first-party starter templates, keyed by slug. JSON is the
 * source of truth; the `as CanvasIR` assertion narrows the wide type
 * `resolveJsonModule` infers (e.g. `version: string` → `"1"`) — the
 * Vitest suite is what actually guarantees each one is well-formed.
 */
export const canvasTemplates = {
	poster: {
		slug: "poster",
		name: "Event Poster — 2:3",
		description:
			"Portrait poster with a top accent bar, oversized headline, and footer byline.",
		ir: poster as CanvasIR,
	},
	"ig-post": {
		slug: "ig-post",
		name: "Instagram Post — Square",
		description:
			"1080×1080 square card with a centered title and dimension caption.",
		ir: igPost as CanvasIR,
	},
	"ig-story": {
		slug: "ig-story",
		name: "Instagram Story — 9:16",
		description:
			"Vertical story with a color band, kicker, big headline, and swipe-up CTA.",
		ir: igStory as CanvasIR,
	},
	"slide-16x9": {
		slug: "slide-16x9",
		name: "Slide — 16:9 Content",
		description:
			"Widescreen content slide with a side rule, title, body copy, and page number.",
		ir: slide16x9 as CanvasIR,
	},
	"slide-title": {
		slug: "slide-title",
		name: "Slide — 16:9 Title",
		description:
			"Centered title slide on a dark background with subtitle and accent dot.",
		ir: slideTitle as CanvasIR,
	},
	"a4-flyer": {
		slug: "a4-flyer",
		name: "Flyer — A4 (print)",
		description:
			"True A4 print flyer in millimetres at 300 DPI: red header band, headline, body, footer.",
		ir: a4Flyer as CanvasIR,
	},
	"business-card": {
		slug: "business-card",
		name: "Business Card — 85×55mm",
		description:
			"Standard business card in millimetres at 300 DPI: name, role, divider, contact.",
		ir: businessCard as CanvasIR,
	},
	"fb-cover": {
		slug: "fb-cover",
		name: "Facebook Cover — 820×312",
		description:
			"Facebook cover banner with brand title, tagline, and a circular badge.",
		ir: fbCover as CanvasIR,
	},
	"twitter-header": {
		slug: "twitter-header",
		name: "Profile Header — 1500×500",
		description:
			"Wide profile header with a top accent band, display title, and handle line.",
		ir: twitterHeader as CanvasIR,
	},
	"presentation-section": {
		slug: "presentation-section",
		name: "Slide — 16:9 Section",
		description:
			"Section divider slide with a numbered eyebrow, accent bar, and chapter title.",
		ir: presentationSection as CanvasIR,
	},
} satisfies Record<string, CanvasTemplate>;

/** Union of the ten template slugs. */
export type CanvasTemplateSlug = keyof typeof canvasTemplates;

/** The ten templates as an array, in registry order. */
export const canvasTemplateList: readonly CanvasTemplate[] =
	Object.values(canvasTemplates);
