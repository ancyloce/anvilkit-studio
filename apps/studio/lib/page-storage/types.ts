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
	/**
	 * **Product** version, mirrored from `root.props.version` by `record-ops.ts`
	 * and authored by the user. Unrelated to {@link PageRecord.schemaRevision}:
	 * this one says which release of the *page* a record holds, that one says
	 * which generation of the *store* wrote it.
	 */
	version: string;
	/**
	 * **Storage metadata** (`p7-001` / ADR 0007 decision 2): which migration
	 * generation this record belongs to. Written by the storage layer through
	 * `stampSchemaRevision` on every write, read by the loader, and **never**
	 * written by a document — persistence metadata in the same category as
	 * {@link PageRecord.createdAt}. See `schema-revision.ts` for the field's
	 * invariants, the three-way loader and the below-floor support policy.
	 */
	schemaRevision: number;
	/**
	 * **Storage metadata** (S1-T04, 2026-09-12): the record's concurrency
	 * version. Starts at 1 when a record is created and advances by one on
	 * every write of any kind; a record written before the field existed has
	 * none and reads as 0 (`pageRevisionOf`), so the type keeps it optional.
	 * A caller that passes `expectedPageRevision` on a save or publish commits
	 * only if this value still matches, atomically with the write — Puck Data
	 * and its `root.props.remoteComponentLock` land in one revision or not at
	 * all. Unrelated to {@link PageRecord.version} (the authored product
	 * version) and to {@link PageRecord.schemaRevision} (which migration
	 * generation wrote the record); neither of those is a concurrency version.
	 */
	pageRevision?: number;
	draft?: DemoPageData;
	published?: DemoPageData;
	createdAt: string;
	updatedAt: string;
	publishedAt?: string;
	archivedAt?: string;
}

/**
 * A record as `record-ops.ts` builds it — everything a {@link PageRecord} has
 * *except* the storage layer's own `schemaRevision`.
 *
 * This is the compiler-level half of "the document never writes the revision":
 * every `record-ops` builder returns this type, so a returned object literal
 * naming `schemaRevision` fails to typecheck, and an adapter cannot persist a
 * built record without passing it through `stampSchemaRevision` first.
 */
export type UnstampedPageRecord = Omit<
	PageRecord,
	"schemaRevision" | "pageRevision"
>;

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
	/**
	 * The {@link PageRecord.pageRevision} the caller last read. When present the
	 * write commits only if the stored record still carries it (0 for a record
	 * that does not exist yet or predates the field); otherwise the adapter
	 * throws {@link PageRevisionConflictError} and writes nothing. Absent means
	 * the caller made no claim and the legacy last-writer-wins behavior applies.
	 */
	expectedPageRevision?: number;
}

export interface PublishPageInput {
	id?: string;
	slug?: string;
	data: DemoPageData;
	/** As on {@link SaveDraftInput.expectedPageRevision}. */
	expectedPageRevision?: number;
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
	/** Throws {@link PageRevisionConflictError} when `expectedPageRevision` is stale. */
	saveDraft(input: SaveDraftInput): Promise<PageRecord>;
	/** Throws {@link PageRevisionConflictError} when `expectedPageRevision` is stale. */
	publish(input: PublishPageInput): Promise<PageRecord>;
	/**
	 * Update page settings (root.props). Returns null when no record matches
	 * `id`; throws {@link PageRevisionConflictError} when `expectedPageRevision`
	 * is present and stale (as on {@link SaveDraftInput.expectedPageRevision}).
	 */
	updateSettings(
		id: string,
		rootProps: PageRootProps,
		expectedPageRevision?: number,
	): Promise<PageRecord | null>;
	/** Hide from the public route. Returns null when no record matches `id`. */
	archive(id: string): Promise<PageRecord | null>;
	/**
	 * Remove the record; a missing record is a no-op. Throws
	 * {@link PageRevisionConflictError} when `expectedPageRevision` is present
	 * and the stored record no longer carries it — nothing is deleted then.
	 */
	delete(id: string, expectedPageRevision?: number): Promise<void>;
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

/** The revision a stored record carries; a record without the field reads as 0. */
export function pageRevisionOf(record: PageRecord | null): number {
	const declared = record?.pageRevision;
	return typeof declared === "number" && Number.isSafeInteger(declared)
		? declared
		: 0;
}

/**
 * Thrown by an adapter when a save or publish names an `expectedPageRevision`
 * the stored record no longer carries. Nothing was written; the caller reloads
 * the page at `currentPageRevision` and decides what to do with its edits.
 */
export class PageRevisionConflictError extends Error {
	readonly expectedPageRevision: number;
	readonly currentPageRevision: number;

	constructor(expectedPageRevision: number, currentPageRevision: number) {
		super(
			`Page revision conflict: expected ${expectedPageRevision}, stored ${currentPageRevision}.`,
		);
		this.name = "PageRevisionConflictError";
		this.expectedPageRevision = expectedPageRevision;
		this.currentPageRevision = currentPageRevision;
	}
}

/**
 * The single expected-revision check every adapter runs between its read and
 * its write. The adapter is responsible for making that read-check-write
 * indivisible (a `BEGIN IMMEDIATE` transaction, a synchronous map update, an
 * in-process write queue); this helper only decides.
 */
export function assertExpectedPageRevision(
	existing: PageRecord | null,
	expectedPageRevision: number | undefined,
): void {
	if (expectedPageRevision === undefined) return;
	const current = pageRevisionOf(existing);
	if (current !== expectedPageRevision) {
		throw new PageRevisionConflictError(expectedPageRevision, current);
	}
}
