import { PageRootSchema } from "@anvilkit/schema";
import { z } from "zod";

/**
 * Structural schema for a complete Puck page document (`Data`).
 *
 * Internal — NOT part of the validator's public surface. `validatePuckPageData`
 * (and the publish-request validator) compose it. We validate the *shape* that
 * storage and the renderer depend on rather than Puck's full internal schema
 * (which is large and version-coupled):
 *
 * - `root.props` must satisfy the canonical {@link PageRootSchema}.
 * - `content` must be an array of `{ type, props }` nodes.
 * - `zones` (legacy multi-zone payloads) is optional.
 *
 * `z.object` (not `z.strictObject`) so Puck-internal/forward-compat keys are
 * stripped, never rejected. Carries no React — runs in Node / Edge / browser.
 */
const puckNodeSchema = z.object({
	type: z.string(),
	props: z.record(z.string(), z.unknown()),
});

export const PuckPageDataSchema = z.object({
	root: z.object({
		props: PageRootSchema,
	}),
	content: z.array(puckNodeSchema),
	zones: z.record(z.string(), z.array(puckNodeSchema)).optional(),
});

/**
 * Envelope for a `POST /api/pages/draft` request. A draft save only commits to
 * the page metadata, so we validate `data.root.props` against the canonical
 * schema and leave `content` untouched (it is persisted verbatim).
 */
export const SaveDraftRequestSchema = z.object({
	id: z.string().optional(),
	slug: z.string().optional(),
	title: z.string().optional(),
	data: z.object({
		root: z.object({
			props: PageRootSchema,
		}),
	}),
});

/**
 * Envelope for a `POST /api/pages/publish` request. Publishing goes live, so
 * the *complete* payload is validated via {@link PuckPageDataSchema}.
 */
export const PublishRequestSchema = z.object({
	id: z.string().optional(),
	slug: z.string().optional(),
	data: PuckPageDataSchema,
});
