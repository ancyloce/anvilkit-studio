import type { CanvasTemplateDefinition } from "@anvilkit/canvas-core";
import { findSizePreset, migrateCanvasIR } from "@anvilkit/canvas-core";
import a4Certificate from "./a4-certificate.json" with { type: "json" };
import a4Flyer from "./a4-flyer.json" with { type: "json" };
import a4Menu from "./a4-menu.json" with { type: "json" };
import businessCard from "./business-card.json" with { type: "json" };
import businessCardDark from "./business-card-dark.json" with { type: "json" };
import fbCover from "./fb-cover.json" with { type: "json" };
import fbPostAnnouncement from "./fb-post-announcement.json" with {
	type: "json",
};
import fbPostEvent from "./fb-post-event.json" with { type: "json" };
import fbPostQuote from "./fb-post-quote.json" with { type: "json" };
import igPost from "./ig-post.json" with { type: "json" };
import igPostQuote from "./ig-post-quote.json" with { type: "json" };
import igPostSale from "./ig-post-sale.json" with { type: "json" };
import igStory from "./ig-story.json" with { type: "json" };
import igStoryCountdown from "./ig-story-countdown.json" with { type: "json" };
import igStoryPoll from "./ig-story-poll.json" with { type: "json" };
import liBannerConsultant from "./li-banner-consultant.json" with {
	type: "json",
};
import liBannerHiring from "./li-banner-hiring.json" with { type: "json" };
import liBannerProfile from "./li-banner-profile.json" with { type: "json" };
import postcardA6 from "./postcard-a6.json" with { type: "json" };
import poster from "./poster.json" with { type: "json" };
import presentationSection from "./presentation-section.json" with {
	type: "json",
};
import reelCoverEpisode from "./reel-cover-episode.json" with { type: "json" };
import reelCoverRecipe from "./reel-cover-recipe.json" with { type: "json" };
import reelCoverTutorial from "./reel-cover-tutorial.json" with {
	type: "json",
};
import slide16x9 from "./slide-16x9.json" with { type: "json" };
import slideAgenda from "./slide-agenda.json" with { type: "json" };
import slideQuote from "./slide-quote.json" with { type: "json" };
import slideStats from "./slide-stats.json" with { type: "json" };
import slideThankYou from "./slide-thank-you.json" with { type: "json" };
import slideTitle from "./slide-title.json" with { type: "json" };
import tiktokCoverLaunch from "./tiktok-cover-launch.json" with {
	type: "json",
};
import tiktokCoverSale from "./tiktok-cover-sale.json" with { type: "json" };
import tiktokCoverTips from "./tiktok-cover-tips.json" with { type: "json" };
import twitterHeader from "./twitter-header.json" with { type: "json" };
import xPostAnnouncement from "./x-post-announcement.json" with {
	type: "json",
};
import xPostQuote from "./x-post-quote.json" with { type: "json" };
import xPostStat from "./x-post-stat.json" with { type: "json" };
import ytThumbPodcast from "./yt-thumb-podcast.json" with { type: "json" };
import ytThumbReview from "./yt-thumb-review.json" with { type: "json" };
import ytThumbTutorial from "./yt-thumb-tutorial.json" with { type: "json" };

/**
 * Resolves each id against `CANVAS_SIZE_PRESETS` (`@anvilkit/canvas-core`),
 * in the order given, and **throws on an id that does not exist**.
 *
 * The throw is the point (cp0-003). This started life as
 * `CANVAS_SIZE_PRESETS.filter((p) => ids.includes(p.id))`, which silently
 * dropped an unknown id — a typo'd or aspirational preset name produced an
 * empty `supportedSizes` that no test and no editor surface would notice
 * (nothing in `@anvilkit/canvas-editor` reads `supportedSizes`: the Templates
 * panel's size filter matches on `document.pages[0].size`, so a wrong id has
 * no on-screen symptom at all). Every id here is a hard-coded literal in this
 * file, never user data, so the only way to trip this is a developer mistake —
 * which the package's Vitest suite then fails on at module load.
 */
function sizePresets(...ids: string[]) {
	return ids.map((id) => {
		const preset = findSizePreset(id);
		if (!preset) {
			throw new Error(
				`@anvilkit/canvas-templates: unknown size preset id "${id}" — not in CANVAS_SIZE_PRESETS.`,
			);
		}
		return preset;
	});
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
 * The controlled tag vocabulary every shipped template draws from (cp3-006,
 * extended by cp3-007).
 *
 * ## Why a vocabulary and not free-form strings
 *
 * `tags` is what makes a catalog searchable once it outgrows a single screen.
 * Free-form tags do not survive growth: `social`/`social-media`/`socials` and
 * `businesscard`/`business-card` are the same facet to a user and three
 * different facets to a `Set`, so the picker fills with near-duplicates and a
 * search for the "wrong" spelling silently returns nothing. Ten templates hid
 * that; forty would not.
 *
 * ## Axes, not a flat list
 *
 * Tags are grouped by the QUESTION they answer, which is what makes the
 * vocabulary extensible without a style guide:
 *
 * - `format` — what the artifact *is* ("a poster", "a slide").
 * - `channel` — where it is published ("Instagram", "print").
 * - `orientation` — its shape, the one facet a user can see at a glance.
 * - `purpose` — why someone would make it ("an event", "networking").
 * - `style` — how it looks, for users who search by look rather than by name.
 * - `size` — a NAMED physical size ("a4"), never a pixel dimension: the
 *   Templates panel already filters exact dimensions via its size preset
 *   picker, so a `1080x1080` tag would be a worse duplicate of a better filter.
 *
 * ## Rules this vocabulary is held to (enforced in `__tests__`)
 *
 * 1. Every tag on every template is a member of this vocabulary.
 * 2. Every member is used by at least one template — no aspirational tags that
 *    show up in the picker and match nothing.
 * 3. Every template carries at least one `format` and one `orientation` tag,
 *    so the two facets a user filters by first are never empty.
 * 4. Tags are lowercase kebab-case, so they can be compared, URL-encoded, and
 *    displayed without normalisation rules living in three places.
 * 5. No word appears on two axes, so a chip means exactly one thing.
 *
 * Adding a template means adding its tags here first. Adding a genuinely new
 * concept means adding it to the right axis — not inventing a synonym of one
 * that already exists.
 */
export const CANVAS_TEMPLATE_TAG_AXES = {
	format: [
		"banner",
		"business-card",
		"certificate",
		"cover",
		"flyer",
		"header",
		"menu",
		"post",
		"postcard",
		"poster",
		"reel-cover",
		"slide",
		"story",
		"thumbnail",
	],
	channel: [
		"facebook",
		"instagram",
		"linkedin",
		"presentation",
		"print",
		"social-media",
		"tiktok",
		"twitter",
		"x",
		"youtube",
	],
	orientation: ["landscape", "portrait", "square"],
	purpose: [
		"agenda",
		"announcement",
		"award",
		"branding",
		"contact",
		"engagement",
		"event",
		"greeting",
		"hiring",
		"launch",
		"marketing",
		"networking",
		"podcast",
		"profile",
		"promotion",
		"quote",
		"recipe",
		"restaurant",
		"review",
		"sale",
		"section-divider",
		"statistics",
		"thank-you",
		"title-slide",
		"tutorial",
	],
	style: [
		"accent-bar",
		"bold",
		"centered",
		"dark",
		"editorial",
		"geometric",
		"gradient",
		"light",
		"minimal",
		"typographic",
	],
	size: ["a4", "a6"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Every vocabulary tag, flattened and sorted — the set a tag is validated
 * against, since search and the panel's chips are axis-blind.
 *
 * Deduplicated defensively even though a separate test forbids the same word
 * on two axes: a `Set` here means an accidental cross-axis repeat degrades
 * into a duplicate-tag test failure rather than a duplicated chip.
 */
export const CANVAS_TEMPLATE_TAGS: readonly string[] = Object.freeze(
	[...new Set(Object.values(CANVAS_TEMPLATE_TAG_AXES).flat())].sort(),
);

/**
 * The first-party starter templates, keyed by each entry's own `id`. JSON
 * is the source of truth for `document`; each is decoded through
 * `migrateCanvasIR` ("migrate-on-read, write current") rather than a bare
 * type cast, since the committed JSON is persisted IR (the original ten were
 * authored at v1; cp3-007's thirty are authored at the current version) and
 * `CanvasTemplateDefinition.document` must be a valid current-version
 * `CanvasIR` — `instantiateTemplate` validates it as one. The package's
 * Vitest suite enforces that every template migrates, validates against the
 * schema, and passes `validateCanvasIRInvariants`.
 *
 * ## Order is load-bearing
 *
 * The Templates panel pages a static catalog at 20 entries
 * (`createStaticTemplateProvider`'s `DEFAULT_PAGE_SIZE`), and renders this
 * object's insertion order. The original ten therefore stay FIRST: they are
 * what `apps/studio/e2e/canvas/templates-panel.spec.ts` asserts is visible
 * without paging, and appending rather than interleaving is what keeps that
 * true as the catalog grows.
 *
 * ## Preset coverage (cp3-007)
 *
 * Each of the eight `CANVAS_SIZE_PRESETS` formats carries exactly three
 * templates. The remaining sixteen are print and presentation sizes, which
 * have no preset at all — the FR-060 catalog is deliberately social-only
 * (cp0-003), so their `supportedSizes` is correctly empty rather than
 * approximated to a near-miss social format.
 */
export const canvasTemplates = {
	poster: {
		id: "poster",
		version: "1",
		title: "Event Poster — 2:3",
		description:
			"Portrait poster with a top accent bar, oversized headline, and footer byline.",
		category: "social",
		tags: ["poster", "portrait", "event", "announcement", "bold", "accent-bar"],
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
		tags: [
			"post",
			"instagram",
			"social-media",
			"square",
			"marketing",
			"minimal",
		],
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
		tags: [
			"story",
			"instagram",
			"social-media",
			"portrait",
			"promotion",
			"bold",
		],
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
		tags: ["slide", "presentation", "landscape", "typographic", "minimal"],
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
		tags: [
			"slide",
			"presentation",
			"landscape",
			"title-slide",
			"dark",
			"centered",
		],
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
		tags: ["flyer", "print", "portrait", "a4", "marketing", "bold"],
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
		tags: [
			"business-card",
			"print",
			"landscape",
			"networking",
			"contact",
			"minimal",
		],
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
		tags: [
			"cover",
			"facebook",
			"social-media",
			"landscape",
			"branding",
			"minimal",
		],
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
		tags: [
			"header",
			"twitter",
			"x",
			"social-media",
			"landscape",
			"profile",
			"branding",
		],
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
		tags: [
			"slide",
			"presentation",
			"landscape",
			"section-divider",
			"accent-bar",
			"bold",
		],
		supportedSizes: [],
		document: migrateCanvasIR(presentationSection),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},

	// --- cp3-007: 30 more, appended so the original ten keep page one ---------

	"ig-post-quote": {
		id: "ig-post-quote",
		version: "1",
		title: "Instagram Post — Quote Card",
		description:
			"Editorial quote card: oversized quotation mark, four-line pull quote, attribution rule.",
		category: "social",
		tags: ["post", "instagram", "social-media", "square", "quote", "editorial"],
		supportedSizes: sizePresets("instagram-post"),
		document: migrateCanvasIR(igPostQuote),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"ig-post-sale": {
		id: "ig-post-sale",
		version: "1",
		title: "Instagram Post — Sale",
		description:
			"Violet-to-blue gradient promo with a starburst discount badge and a pill CTA.",
		category: "social",
		tags: [
			"post",
			"instagram",
			"social-media",
			"square",
			"sale",
			"gradient",
			"bold",
		],
		supportedSizes: sizePresets("instagram-post"),
		document: migrateCanvasIR(igPostSale),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"ig-story-poll": {
		id: "ig-story-poll",
		version: "1",
		title: "Instagram Story — Poll",
		description:
			"Centered question card with two tappable option pills, inside the story safe area.",
		category: "social",
		tags: [
			"story",
			"instagram",
			"social-media",
			"portrait",
			"engagement",
			"centered",
		],
		supportedSizes: sizePresets("instagram-story"),
		document: migrateCanvasIR(igStoryPoll),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"ig-story-countdown": {
		id: "ig-story-countdown",
		version: "1",
		title: "Instagram Story — Save the Date",
		description:
			"Dark event story with a soft glow, three-line display title, date, venue, and CTA.",
		category: "social",
		tags: [
			"story",
			"instagram",
			"social-media",
			"portrait",
			"event",
			"dark",
			"bold",
		],
		supportedSizes: sizePresets("instagram-story"),
		document: migrateCanvasIR(igStoryCountdown),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"reel-cover-tutorial": {
		id: "reel-cover-tutorial",
		version: "1",
		title: "Reel Cover — Tutorial",
		description:
			"Dark 9:16 cover with a pill badge, four-line title, and three numbered steps.",
		category: "social",
		tags: [
			"reel-cover",
			"instagram",
			"social-media",
			"portrait",
			"tutorial",
			"bold",
		],
		supportedSizes: sizePresets("instagram-reel-cover"),
		document: migrateCanvasIR(reelCoverTutorial),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"reel-cover-recipe": {
		id: "reel-cover-recipe",
		version: "1",
		title: "Reel Cover — Recipe",
		description:
			"Warm 9:16 cover with a rounded image well above a dish title and cook-time line.",
		category: "social",
		tags: [
			"reel-cover",
			"instagram",
			"social-media",
			"portrait",
			"recipe",
			"light",
		],
		supportedSizes: sizePresets("instagram-reel-cover"),
		document: migrateCanvasIR(reelCoverRecipe),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"reel-cover-episode": {
		id: "reel-cover-episode",
		version: "1",
		title: "Reel Cover — Podcast Episode",
		description:
			"Centered episode cover built on a disc motif, with guest credit and show name.",
		category: "social",
		tags: [
			"reel-cover",
			"instagram",
			"social-media",
			"portrait",
			"podcast",
			"dark",
			"geometric",
		],
		supportedSizes: sizePresets("instagram-reel-cover"),
		document: migrateCanvasIR(reelCoverEpisode),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"tiktok-cover-tips": {
		id: "tiktok-cover-tips",
		version: "1",
		title: "TikTok Cover — Tips List",
		description:
			"Rounded dark band over white with a badge, four-line hook, and three numbered tips.",
		category: "social",
		tags: ["cover", "tiktok", "social-media", "portrait", "tutorial", "bold"],
		supportedSizes: sizePresets("tiktok-cover"),
		document: migrateCanvasIR(tiktokCoverTips),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"tiktok-cover-launch": {
		id: "tiktok-cover-launch",
		version: "1",
		title: "TikTok Cover — Launch",
		description:
			"Navy-to-blue gradient launch cover with a soft ring, huge title, and pill CTA.",
		category: "social",
		tags: ["cover", "tiktok", "social-media", "portrait", "launch", "gradient"],
		supportedSizes: sizePresets("tiktok-cover"),
		document: migrateCanvasIR(tiktokCoverLaunch),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"tiktok-cover-sale": {
		id: "tiktok-cover-sale",
		version: "1",
		title: "TikTok Cover — Flash Sale",
		description:
			"Amber page behind a dark rounded panel: 300pt discount figure, code CTA, terms line.",
		category: "social",
		tags: [
			"cover",
			"tiktok",
			"social-media",
			"portrait",
			"sale",
			"bold",
			"centered",
		],
		supportedSizes: sizePresets("tiktok-cover"),
		document: migrateCanvasIR(tiktokCoverSale),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"yt-thumb-tutorial": {
		id: "yt-thumb-tutorial",
		version: "1",
		title: "YouTube Thumbnail — Tutorial",
		description:
			"Dark 1280×720 thumbnail with a left accent bar, badge, three-line title, and a portrait well.",
		category: "social",
		tags: [
			"thumbnail",
			"youtube",
			"social-media",
			"landscape",
			"tutorial",
			"bold",
		],
		supportedSizes: sizePresets("youtube-thumbnail"),
		document: migrateCanvasIR(ytThumbTutorial),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"yt-thumb-review": {
		id: "yt-thumb-review",
		version: "1",
		title: "YouTube Thumbnail — Review",
		description:
			"Full-height product well beside a verdict headline and a five-star rating row.",
		category: "social",
		tags: [
			"thumbnail",
			"youtube",
			"social-media",
			"landscape",
			"review",
			"dark",
		],
		supportedSizes: sizePresets("youtube-thumbnail"),
		document: migrateCanvasIR(ytThumbReview),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"yt-thumb-podcast": {
		id: "yt-thumb-podcast",
		version: "1",
		title: "YouTube Thumbnail — Podcast",
		description:
			"Indigo thumbnail built from nested hexagons, with episode number, title, and guest.",
		category: "social",
		tags: [
			"thumbnail",
			"youtube",
			"social-media",
			"landscape",
			"podcast",
			"geometric",
		],
		supportedSizes: sizePresets("youtube-thumbnail"),
		document: migrateCanvasIR(ytThumbPodcast),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"fb-post-event": {
		id: "fb-post-event",
		version: "1",
		title: "Facebook Post — Event",
		description:
			"1200×630 link-preview card with a blue date block, meetup title, venue, and URL.",
		category: "social",
		tags: [
			"post",
			"facebook",
			"social-media",
			"landscape",
			"event",
			"accent-bar",
		],
		supportedSizes: sizePresets("facebook-post"),
		document: migrateCanvasIR(fbPostEvent),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"fb-post-announcement": {
		id: "fb-post-announcement",
		version: "1",
		title: "Facebook Post — Announcement",
		description:
			"Dark announcement card with an amber kicker, two-line headline, body, and chip CTA.",
		category: "social",
		tags: [
			"post",
			"facebook",
			"social-media",
			"landscape",
			"announcement",
			"bold",
		],
		supportedSizes: sizePresets("facebook-post"),
		document: migrateCanvasIR(fbPostAnnouncement),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"fb-post-quote": {
		id: "fb-post-quote",
		version: "1",
		title: "Facebook Post — Quote",
		description:
			"Light editorial quote card with a set-back quotation mark, rule, author, and source.",
		category: "social",
		tags: [
			"post",
			"facebook",
			"social-media",
			"landscape",
			"quote",
			"editorial",
			"light",
		],
		supportedSizes: sizePresets("facebook-post"),
		document: migrateCanvasIR(fbPostQuote),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"li-banner-profile": {
		id: "li-banner-profile",
		version: "1",
		title: "LinkedIn Banner — Profile",
		description:
			"1584×396 profile banner: name, role, and site, kept clear of the avatar overlap.",
		category: "social",
		tags: [
			"banner",
			"linkedin",
			"social-media",
			"landscape",
			"profile",
			"minimal",
		],
		supportedSizes: sizePresets("linkedin-banner"),
		document: migrateCanvasIR(liBannerProfile),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"li-banner-consultant": {
		id: "li-banner-consultant",
		version: "1",
		title: "LinkedIn Banner — Consultant",
		description:
			"Left-to-right blue gradient banner with a service headline, sub-line, and booking pill.",
		category: "social",
		tags: [
			"banner",
			"linkedin",
			"social-media",
			"landscape",
			"branding",
			"gradient",
		],
		supportedSizes: sizePresets("linkedin-banner"),
		document: migrateCanvasIR(liBannerConsultant),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"li-banner-hiring": {
		id: "li-banner-hiring",
		version: "1",
		title: "LinkedIn Banner — Hiring",
		description:
			"Amber-and-navy split banner announcing one open role, its location, and a closing date.",
		category: "social",
		tags: ["banner", "linkedin", "social-media", "landscape", "hiring", "bold"],
		supportedSizes: sizePresets("linkedin-banner"),
		document: migrateCanvasIR(liBannerHiring),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"x-post-quote": {
		id: "x-post-quote",
		version: "1",
		title: "X Post — Quote",
		description:
			"1600×900 in-stream quote with a full-height rule, three-line pull quote, and handle.",
		category: "social",
		tags: [
			"post",
			"twitter",
			"x",
			"social-media",
			"landscape",
			"quote",
			"editorial",
		],
		supportedSizes: sizePresets("x-twitter-post"),
		document: migrateCanvasIR(xPostQuote),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"x-post-announcement": {
		id: "x-post-announcement",
		version: "1",
		title: "X Post — Announcement",
		description:
			"Slate-to-violet gradient release card with a kicker, two-line headline, and chip CTA.",
		category: "social",
		tags: [
			"post",
			"twitter",
			"x",
			"social-media",
			"landscape",
			"announcement",
			"gradient",
		],
		supportedSizes: sizePresets("x-twitter-post"),
		document: migrateCanvasIR(xPostAnnouncement),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"x-post-stat": {
		id: "x-post-stat",
		version: "1",
		title: "X Post — Stat Card",
		description:
			"Three-column statistic card with hairline dividers, captions, and a source footnote.",
		category: "social",
		tags: [
			"post",
			"twitter",
			"x",
			"social-media",
			"landscape",
			"statistics",
			"minimal",
		],
		supportedSizes: sizePresets("x-twitter-post"),
		document: migrateCanvasIR(xPostStat),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"a4-menu": {
		id: "a4-menu",
		version: "1",
		title: "Menu — A4 (print)",
		description:
			"A4 restaurant menu in millimetres at 300 DPI: three courses, ruled headings, aligned prices.",
		category: "print",
		tags: ["menu", "print", "portrait", "a4", "restaurant", "typographic"],
		supportedSizes: [],
		document: migrateCanvasIR(a4Menu),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"a4-certificate": {
		id: "a4-certificate",
		version: "1",
		title: "Certificate — A4 landscape (print)",
		description:
			"Landscape A4 award certificate with a double border, starburst seal, and signature rules.",
		category: "print",
		tags: ["certificate", "print", "landscape", "a4", "award", "centered"],
		supportedSizes: [],
		document: migrateCanvasIR(a4Certificate),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"postcard-a6": {
		id: "postcard-a6",
		version: "1",
		title: "Postcard — A6 landscape (print)",
		description:
			"148×105mm postcard: a rounded photo well beside a destination title and short note.",
		category: "print",
		tags: ["postcard", "print", "landscape", "a6", "greeting", "light"],
		supportedSizes: [],
		document: migrateCanvasIR(postcardA6),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"business-card-dark": {
		id: "business-card-dark",
		version: "1",
		title: "Business Card — 85×55mm dark",
		description:
			"Near-black card with an edge accent, hexagonal mark, and a three-line contact block.",
		category: "print",
		tags: [
			"business-card",
			"print",
			"landscape",
			"networking",
			"contact",
			"dark",
		],
		supportedSizes: [],
		document: migrateCanvasIR(businessCardDark),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-agenda": {
		id: "slide-agenda",
		version: "1",
		title: "Slide — 16:9 Agenda",
		description:
			"Numbered four-item agenda with hairline rules and a side panel holding an image well.",
		category: "presentation",
		tags: [
			"slide",
			"presentation",
			"landscape",
			"agenda",
			"typographic",
			"minimal",
		],
		supportedSizes: [],
		document: migrateCanvasIR(slideAgenda),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-quote": {
		id: "slide-quote",
		version: "1",
		title: "Slide — 16:9 Quote",
		description:
			"Centered pull-quote slide with a quotation mark, accent rule, author, and source.",
		category: "presentation",
		tags: [
			"slide",
			"presentation",
			"landscape",
			"quote",
			"editorial",
			"centered",
		],
		supportedSizes: [],
		document: migrateCanvasIR(slideQuote),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-stats": {
		id: "slide-stats",
		version: "1",
		title: "Slide — 16:9 Metrics",
		description:
			"Three rounded metric cards, each with a hexagon marker, a headline figure, and a caption.",
		category: "presentation",
		tags: [
			"slide",
			"presentation",
			"landscape",
			"statistics",
			"bold",
			"geometric",
		],
		supportedSizes: [],
		document: migrateCanvasIR(slideStats),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
	"slide-thank-you": {
		id: "slide-thank-you",
		version: "1",
		title: "Slide — 16:9 Thank You",
		description:
			"Dark closing slide: centered thanks, accent dot, questions prompt, and contact line.",
		category: "presentation",
		tags: [
			"slide",
			"presentation",
			"landscape",
			"thank-you",
			"dark",
			"centered",
		],
		supportedSizes: [],
		document: migrateCanvasIR(slideThankYou),
		variables: [],
		editableSlots: [],
		lockedNodeIds: [],
	},
} satisfies Record<string, CanvasTemplateCatalogEntry>;

/** Union of the shipped template ids. */
export type CanvasTemplateId = keyof typeof canvasTemplates;

/** The templates as an array, in registry order. */
export const canvasTemplateList: readonly CanvasTemplateCatalogEntry[] =
	Object.values(canvasTemplates);
