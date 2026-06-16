/**
 * @file Pure projection between a page's canonical Puck `root.props`
 * (title + SEO) and the core {@link StudioPage}/{@link StudioPageSeo} sidecar
 * shape the rail, breadcrumb, and page-settings dialog read (PRD 0004 F4).
 *
 * `root.props` is the single source of truth; this module lets hosts derive
 * the sidecar from it instead of holding a parallel copy. The input is a
 * **structural** shape (mirroring `@anvilkit/schema`'s `PageSeo`/`PageRootProps`)
 * rather than an import of `@anvilkit/schema` — `@anvilkit/schema` already
 * depends on `@anvilkit/core/types`, so importing it here would form a package
 * cycle. Hosts pass their `PageRootProps`, which satisfies these types
 * structurally.
 *
 * Field-name reconciliation (PRD §5.1):
 *
 * | `root.props.seo` (schema) | `StudioPageSeo` (core) | Note          |
 * | :------------------------ | :--------------------- | :------------ |
 * | `title`                   | `metaTitle`            | rename        |
 * | `description`             | `metaDescription`      | rename        |
 * | `ogImage`                 | `ogImage`              | identical     |
 * | `noIndex`                 | `noindex`              | casing        |
 * | `canonical`               | —                      | no equivalent |
 */

import type { StudioPage, StudioPageSeo } from "../../types/pages.js";

/** SEO sub-shape of a page's `root.props.seo` (mirrors `@anvilkit/schema` `PageSeo`). */
export interface PageRootSeoInput {
	readonly title?: string;
	readonly description?: string;
	readonly ogImage?: string;
	readonly noIndex?: boolean;
	readonly canonical?: string;
}

/** The title + seo slice of a page's `root.props` this module projects. */
export interface PageRootInput {
	readonly title?: string;
	readonly seo?: PageRootSeoInput;
}

/**
 * Project `root.props.seo` (schema field names) onto the core
 * {@link StudioPageSeo} shape. `canonical` has no `StudioPageSeo` equivalent
 * and is dropped. Returns `undefined` when no SEO field is set so callers can
 * omit the block entirely.
 */
export function pageRootSeoToStudioPageSeo(
	seo: PageRootSeoInput | undefined,
): StudioPageSeo | undefined {
	if (seo === undefined) return undefined;
	const out: {
		metaTitle?: string;
		metaDescription?: string;
		ogImage?: string;
		noindex?: boolean;
	} = {};
	if (seo.title !== undefined) out.metaTitle = seo.title;
	if (seo.description !== undefined) out.metaDescription = seo.description;
	if (seo.ogImage !== undefined) out.ogImage = seo.ogImage;
	if (seo.noIndex !== undefined) out.noindex = seo.noIndex;
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Inverse of {@link pageRootSeoToStudioPageSeo} for write-back: map an edited
 * {@link StudioPageSeo} (e.g. from the page-settings dialog) onto
 * `root.props.seo` field names. `canonical` is not represented in
 * `StudioPageSeo`; callers merge the result over the existing `seo` to
 * preserve it.
 */
export function studioPageSeoToPageRootSeo(
	seo: StudioPageSeo | undefined,
): PageRootSeoInput {
	if (seo === undefined) return {};
	const out: {
		title?: string;
		description?: string;
		ogImage?: string;
		noIndex?: boolean;
	} = {};
	if (seo.metaTitle !== undefined) out.title = seo.metaTitle;
	if (seo.metaDescription !== undefined) out.description = seo.metaDescription;
	if (seo.ogImage !== undefined) out.ogImage = seo.ogImage;
	if (seo.noindex !== undefined) out.noIndex = seo.noindex;
	return out;
}

/**
 * Project a page's `root.props` (title + seo) onto the {@link StudioPage}
 * fields the rail/breadcrumb read, so the sidecar no longer holds a parallel
 * copy. Returns only the derived slice; callers merge it with the routing
 * metadata they own (`id`/`path`/`route`/`locked`).
 */
export function pageRootToStudioPageFields(
	root: PageRootInput | undefined,
): Partial<Pick<StudioPage, "title" | "seo">> {
	const seo = pageRootSeoToStudioPageSeo(root?.seo);
	return {
		...(root?.title !== undefined ? { title: root.title } : {}),
		...(seo !== undefined ? { seo } : {}),
	};
}
