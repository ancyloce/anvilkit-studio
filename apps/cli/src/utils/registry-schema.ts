import { z } from "zod";

/**
 * CLI-side runtime parser for the marketplace registry feed.
 *
 * The CANONICAL schema lives in `apps/docs/src/registry/feed.schema.ts`.
 * This copy is intentionally lenient: it asserts only the fields the CLI
 * relies on for `anvilkit add` resolution and codemod dispatch, and uses
 * `passthrough()` so feed-side additive bumps don't break the CLI.
 *
 * Phase 6 / M11 / `phase6-010`.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

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

export const RegistryEntryParser = z
	.object({
		slug: z.string().min(1),
		kind: RegistryEntryKindSchema,
		name: z.string().min(1),
		description: z.string().min(1),
		packageName: z.string().min(1),
		version: z.string().regex(SEMVER, "semver"),
		publisher: RegistryPublisherSchema,
		verified: z.boolean(),
		installSpec: z
			.object({
				mutates: z.array(z.string()).default([]),
				scaffoldOnly: z.boolean().default(false),
				peerInstalls: z.array(z.string()).max(8).default([]),
			})
			.default({ mutates: [], scaffoldOnly: false, peerInstalls: [] }),
	})
	.loose();

export type RegistryEntry = z.infer<typeof RegistryEntryParser>;

export const RegistryFeedParser = z
	.object({
		feedVersion: z.literal("1"),
		entries: z.array(RegistryEntryParser),
	})
	.loose();

export type RegistryFeed = z.infer<typeof RegistryFeedParser>;
