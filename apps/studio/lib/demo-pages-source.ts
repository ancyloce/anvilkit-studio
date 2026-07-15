/**
 * @file Shared page-root accessor contract for Studio page sources.
 */

import type { PageRootProps } from "@anvilkit/schema";

/**
 * Read/write access to a page's canonical Puck `root.props` (PRD 0004 F4).
 * Page sources derive `title`/`seo` from `root.props` instead of holding a
 * parallel copy, and write settings/rename edits back into it so the rail,
 * breadcrumb, and renderer read one source.
 */
export interface DemoPageRootAccessor {
	getRootProps(id: string): PageRootProps | undefined;
	updateRootProps(id: string, patch: Partial<PageRootProps>): void;
}
