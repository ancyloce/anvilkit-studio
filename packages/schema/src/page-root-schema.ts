import { z } from "zod";

/**
 * Canonical SEO metadata block stored on a page's `root.props.seo`.
 *
 * Field-name reconciliation with core's `StudioPageSeo`
 * (`@anvilkit/core` → `packages/core/src/types/pages.ts`) so F4 can project
 * `root.props.seo` into the rail/breadcrumb sidecar losslessly:
 *
 * | This schema   | core `StudioPageSeo` | Note                          |
 * | :------------ | :------------------- | :---------------------------- |
 * | `title`       | `metaTitle`          | rename                        |
 * | `description` | `metaDescription`    | rename                        |
 * | `ogImage`     | `ogImage`            | identical                     |
 * | `noIndex`     | `noindex`            | casing differs                |
 * | `canonical`   | —                    | new; no core equivalent yet   |
 *
 * Zod v4 idioms (mirrors `@anvilkit/core/src/config/schema.ts`):
 * - `z.url()` not `z.string().url()` — top-level format validators.
 * - `.prefault({})` not `.default({})` — `.default()` short-circuits parsing
 *   and would yield a literal `{}`; `.prefault({})` re-parses so an omitted
 *   `seo` block still resolves to `{ noIndex: false }`.
 */
export const PageSeoSchema = z
	.object({
		title: z.string().optional(),
		description: z.string().optional(),
		ogImage: z.url("Must be a valid URL").optional(),
		noIndex: z.boolean().default(false),
		canonical: z.url("Must be a valid URL").optional(),
	})
	.prefault({});

/**
 * The authoritative page payload, canonical in Puck `root.props`. Editor,
 * validator, storage, and renderer all read this single shape.
 *
 * `z.object` (not `z.strictObject`) so Puck-internal keys (e.g. `id`) and
 * forward-compat fields are stripped rather than rejected.
 */
export const PageRootSchema = z.object({
	title: z.string().min(1, "Page title is required"),
	slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
	status: z.enum(["draft", "published", "archived"]),
	version: z.string(),
	parentFolder: z.string().default("/"),
	seo: PageSeoSchema,
});

export type PageRootProps = z.infer<typeof PageRootSchema>;
export type PageSeo = z.infer<typeof PageSeoSchema>;
