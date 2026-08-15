import type { EditorPageData } from "./page-storage/types";

/**
 * A new page's starting document. `root.props` carries the canonical
 * `PageRootSchema` keys (`@anvilkit/schema`) — `status` and `version` have
 * no visible field but the storage layer validates every save against that
 * schema, so a document without them cannot be persisted.
 */
export function emptyDocument(): EditorPageData {
	return {
		root: {
			props: {
				title: "Untitled",
				slug: "untitled",
				description: "",
				status: "draft",
				version: "1",
			},
		},
		content: [],
		zones: {},
	} as unknown as EditorPageData;
}
