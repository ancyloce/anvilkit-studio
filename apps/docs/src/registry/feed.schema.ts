/**
 * Zod schema for the Anvilkit marketplace registry feed.
 *
 * The feed is the single source of truth that powers two surfaces:
 *
 * 1. The `/marketplace` catalog page on the docs site (filterable
 *    grid of plugins, templates, and components).
 * 2. `anvilkit add <slug>` — the CLI resolves slugs against this
 *    feed before falling back to raw npm (gated by `--unsafe`).
 *
 * The feed's published shape is `feed.json` at
 * `apps/docs/src/registry/feed.json` (also re-published to
 * `https://docs.anvilkit.dev/registry/feed.json` via the docs site
 * Vercel build, cached for 24 hours).
 *
 * Phase 6 / M11 / `phase6-011`.
 */

import { z } from "zod";

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;
const ABSOLUTE_PATH = /^\/[\w/.-]*$/;

export const RegistryEntryKindSchema = z.enum([
	"plugin",
	"template",
	"component",
]);

export type RegistryEntryKind = z.infer<typeof RegistryEntryKindSchema>;

export const RegistryPublisherSchema = z.enum([
	"first-party",
	"verified",
	"community",
]);

export type RegistryPublisher = z.infer<typeof RegistryPublisherSchema>;

export const RegistryScorecardSchema = z.object({
	passed: z.boolean(),
	ranAt: z.iso.datetime().optional(),
	commit: z
		.string()
		.regex(/^[a-f0-9]{7,40}$/)
		.optional(),
	checks: z.record(z.string(), z.boolean()).optional(),
	notes: z.string().max(512).optional(),
});

export type RegistryScorecard = z.infer<typeof RegistryScorecardSchema>;

export const RegistryInstallSpecSchema = z.object({
	mutates: z.array(z.string().min(1).max(255)).default([]),
	scaffoldOnly: z.boolean().default(false),
	peerInstalls: z.array(z.string().min(1).max(214)).max(8).default([]),
});

export type RegistryInstallSpec = z.infer<typeof RegistryInstallSpecSchema>;

export const RegistryEntrySchema = z.object({
	slug: z.string().regex(SLUG, "kebab-case slug, 2-64 chars"),
	kind: RegistryEntryKindSchema,
	name: z.string().min(1).max(120),
	description: z.string().min(1).max(512),
	packageName: z.string().min(1).max(214),
	version: z.string().regex(SEMVER, "semver"),
	category: z.string().min(1).max(64),
	tags: z.array(z.string().min(1).max(48)).max(16).default([]),
	publisher: RegistryPublisherSchema,
	verified: z.boolean(),
	scorecard: RegistryScorecardSchema.optional(),
	repository: z.url().optional(),
	homepage: z.url().optional(),
	preview: z.string().regex(ABSOLUTE_PATH, "absolute path").optional(),
	addedAt: z.iso.datetime(),
	installSpec: RegistryInstallSpecSchema.default({
		mutates: [],
		scaffoldOnly: false,
		peerInstalls: [],
	}),
});

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const RegistryFeedSchema = z
	.object({
		$schema: z.string().optional(),
		feedVersion: z.literal("1"),
		generatedAt: z.iso.datetime(),
		entries: z.array(RegistryEntrySchema),
	})
	.refine(
		(feed) => {
			const seen = new Set<string>();
			for (const entry of feed.entries) {
				const key = `${entry.kind}:${entry.slug}`;
				if (seen.has(key)) return false;
				seen.add(key);
			}
			return true;
		},
		{ error: "duplicate (kind, slug) pair in feed.entries" },
	);

export type RegistryFeed = z.infer<typeof RegistryFeedSchema>;
