import type { CanvasTemplateDefinition } from "@anvilkit/canvas-core";
import { CANVAS_SIZE_PRESETS, migrateCanvasIR } from "@anvilkit/canvas-core";
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

/** Every preset in `ids` that exists in {@link CANVAS_SIZE_PRESETS}. */
function sizePresets(...ids: string[]) {
	return CANVAS_SIZE_PRESETS.filter((preset) => ids.includes(preset.id));
}

/**
 * A `@anvilkit/canvas-templates` catalog entry: the canonical FR-020
 * {@link CanvasTemplateDefinition} plus one UI-only field. `description` is
 * the one-line blurb the Templates panel shows under a template's name —
 * `CanvasTemplateDefinition` itself has no description field (PRD §12.5), so
 * this package (its only consumer) extends the contract rather than widening
 * the canonical core type for one caller.
 *
 * Supersedes the old bare `CanvasTemplate` (`{slug, name, description, ir}`,
 * pre-canvas-m2-004) — see canvas-m2-001's naming-collision decision.
 */
export interface CanvasTemplateCatalogEntry extends CanvasTemplateDefinition {
	description: string;
}

/**
 * The ten first-party starter templates, keyed by each entry's own `id`. JSON
 * is the source of truth for `document`; each is decoded through
 * `migrateCanvasIR` ("migrate-on-read, write current") rather than a bare
 * type cast, since the committed JSON is persisted IR (some authored at v1)
 * and `CanvasTemplateDefinition.document` must be a valid current-version
 * `CanvasIR` — `instantiateTemplate` validates it as one. The package's
 * Vitest suite enforces that every template migrates and validates.
 */
export const canvasTemplates = {
	poster: {
		id: "poster",
		version: "1",
		title: "Event Poster — 2:3",
		description:
			"Portrait poster with a top accent bar, oversized headline, and footer byline.",
		category: "social",
		tags: ["poster", "event"],
		supportedSizes: [],
		document: migrateCanvasIR(poster),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"ig-post": {
		id: "ig-post",
		version: "1",
		title: "Instagram Post — Square",
		description:
			"1080×1080 square card with a centered title and dimension caption.",
		category: "social",
		tags: ["instagram", "square"],
		supportedSizes: sizePresets("instagram-post"),
		document: migrateCanvasIR(igPost),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"ig-story": {
		id: "ig-story",
		version: "1",
		title: "Instagram Story — 9:16",
		description:
			"Vertical story with a color band, kicker, big headline, and swipe-up CTA.",
		category: "social",
		tags: ["instagram", "story"],
		supportedSizes: sizePresets("instagram-story"),
		document: migrateCanvasIR(igStory),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-16x9": {
		id: "slide-16x9",
		version: "1",
		title: "Slide — 16:9 Content",
		description:
			"Widescreen content slide with a side rule, title, body copy, and page number.",
		category: "presentation",
		tags: ["slide", "widescreen"],
		supportedSizes: [],
		document: migrateCanvasIR(slide16x9),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-title": {
		id: "slide-title",
		version: "1",
		title: "Slide — 16:9 Title",
		description:
			"Centered title slide on a dark background with subtitle and accent dot.",
		category: "presentation",
		tags: ["slide", "title"],
		supportedSizes: [],
		document: migrateCanvasIR(slideTitle),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"a4-flyer": {
		id: "a4-flyer",
		version: "1",
		title: "Flyer — A4 (print)",
		description:
			"True A4 print flyer in millimetres at 300 DPI: red header band, headline, body, footer.",
		category: "print",
		tags: ["flyer", "a4", "print"],
		supportedSizes: [],
		document: migrateCanvasIR(a4Flyer),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"business-card": {
		id: "business-card",
		version: "1",
		title: "Business Card — 85×55mm",
		description:
			"Standard business card in millimetres at 300 DPI: name, role, divider, contact.",
		category: "print",
		tags: ["business-card", "print"],
		supportedSizes: [],
		document: migrateCanvasIR(businessCard),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"fb-cover": {
		id: "fb-cover",
		version: "1",
		title: "Facebook Cover — 820×312",
		description:
			"Facebook cover banner with brand title, tagline, and a circular badge.",
		category: "social",
		tags: ["facebook", "cover"],
		supportedSizes: [],
		document: migrateCanvasIR(fbCover),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"twitter-header": {
		id: "twitter-header",
		version: "1",
		title: "Profile Header — 1500×500",
		description:
			"Wide profile header with a top accent band, display title, and handle line.",
		category: "social",
		tags: ["twitter", "x", "header"],
		supportedSizes: [],
		document: migrateCanvasIR(twitterHeader),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"presentation-section": {
		id: "presentation-section",
		version: "1",
		title: "Slide — 16:9 Section",
		description:
			"Section divider slide with a numbered eyebrow, accent bar, and chapter title.",
		category: "presentation",
		tags: ["slide", "section"],
		supportedSizes: [],
		document: migrateCanvasIR(presentationSection),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
} satisfies Record<string, CanvasTemplateCatalogEntry>;

/** Union of the ten template ids. */
export type CanvasTemplateId = keyof typeof canvasTemplates;

/** The ten templates as an array, in registry order. */
export const canvasTemplateList: readonly CanvasTemplateCatalogEntry[] =
	Object.values(canvasTemplates);
