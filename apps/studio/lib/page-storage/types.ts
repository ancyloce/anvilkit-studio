import type { PageRootProps } from "@anvilkit/schema";
import type { Data } from "@puckeditor/core";
import type { DemoComponents } from "../puck-demo";

/**
 * Full Puck page document used as the storage payload. Type-only imports keep
 * this module React-free so the adapters unit-test under a node environment.
 */
export type DemoPageData = Data<DemoComponents, PageRootProps>;

export type PageStatus = "draft" | "published" | "archived";

/**
 * The durable page record. Draft and published payloads are stored separately so
 * the public route can render the last published document while authors keep
 * editing an unpublished `draft`.
 */
export interface PageRecord {
	id: string;
	slug: string;
	title: string;
	status: PageStatus;
	version: string;
	draft?: DemoPageData;
	published?: DemoPageData;
	createdAt: string;
	updatedAt: string;
	publishedAt?: string;
	archivedAt?: string;
}

/** A record without its heavy payloads — what `GET /api/pages` returns. */
export type PageSummary = Omit<PageRecord, "draft" | "published">;

export interface ListPagesParams {
	status?: PageStatus;
	parentFolder?: string;
}

export interface SaveDraftInput {
	/** Target an existing record by id; otherwise the record is matched/created by slug. */
	id?: string;
	slug: string;
	title?: string;
	data: DemoPageData;
}

export interface PublishPageInput {
	id?: string;
	slug?: string;
	data: DemoPageData;
}

export interface DuplicatePageInput {
	/** Slug for the copy. Defaults to `<source-slug>-copy`. */
	slug?: string;
	/** Title for the copy. Defaults to `<source-title> (Copy)`. */
	title?: string;
}

/**
 * Storage abstraction behind the demo's page pipeline. The module-level `Map`
 * MVP is replaced by interchangeable implementations
 * ({@link MemoryPageStorageAdapter}, {@link FileSystemPageStorageAdapter}); a real
 * backend would add another implementation without touching the API routes.
 */
export interface PageStorageAdapter {
	getBySlug(slug: string): Promise<PageRecord | null>;
	getById(id: string): Promise<PageRecord | null>;
	list(params?: ListPagesParams): Promise<PageRecord[]>;
	saveDraft(input: SaveDraftInput): Promise<PageRecord>;
	publish(input: PublishPageInput): Promise<PageRecord>;
	/** Update page settings (root.props). Returns null when no record matches `id`. */
	updateSettings(
		id: string,
		rootProps: PageRootProps,
	): Promise<PageRecord | null>;
	/** Hide from the public route. Returns null when no record matches `id`. */
	archive(id: string): Promise<PageRecord | null>;
	delete(id: string): Promise<void>;
	/** Clone a record under a new id+slug. Returns null when no record matches `id`. */
	duplicate(id: string, input?: DuplicatePageInput): Promise<PageRecord | null>;
	getVersion(pageId: string, version: string): Promise<PageRecord | null>;
}

/** Project a record onto its lightweight summary (drops draft/published payloads). */
export function toSummary(record: PageRecord): PageSummary {
	const { draft: _draft, published: _published, ...summary } = record;
	return summary;
}

/**
 * The published payload to serve from the public route, or `null` when nothing
 * should render: a record that is archived, or has never been published.
 * Shared by the render route and the adapters' tests so "drafts never render"
 * is enforced in exactly one place.
 */
export function selectPublishedPayload(
	record: PageRecord | null | undefined,
): DemoPageData | null {
	if (record === null || record === undefined) return null;
	if (record.status === "archived") return null;
	return record.published ?? null;
}
