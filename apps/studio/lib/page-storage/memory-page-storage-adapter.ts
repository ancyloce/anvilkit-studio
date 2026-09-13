import type { PageRootProps } from "@anvilkit/schema";
import {
	applyArchive,
	applySettings,
	buildDraftRecord,
	buildDuplicate,
	buildPublishRecord,
	cloneRecordValue as clone,
	type RecordOpsContext,
} from "./record-ops";
import {
	classifyStoredRecord,
	requireStoredRecord,
	stampSchemaRevision,
} from "./schema-revision";
import {
	assertExpectedPageRevision,
	type DuplicatePageInput,
	type ListPagesParams,
	type PageRecord,
	type PageStorageAdapter,
	type PublishPageInput,
	type SaveDraftInput,
	type UnstampedPageRecord,
} from "./types";

export interface MemoryPageStorageAdapterOptions {
	/**
	 * Seed records (cloned on construction). Seeds arrive from **outside** the
	 * store — a test fixture, a restored dump — so each one is classified on
	 * ingest exactly as a file or a row would be: an unstamped seed reads as
	 * below-floor (loaded, diagnosed, promoted on its next write), and a seed
	 * that is not a record at all throws rather than poisoning the map.
	 */
	seed?: readonly UnstampedPageRecord[];
	/** Injectable clock for deterministic timestamps in tests. */
	now?: () => Date;
	/** Injectable id factory for deterministic ids in tests. */
	idFactory?: () => string;
}

/**
 * In-process {@link PageStorageAdapter} backed by a `Map<id, PageRecord>`. The
 * MVP's module-level slug map now lives behind this abstraction. Records are
 * cloned on read and write so callers can never mutate internal state — giving
 * the same value semantics as the filesystem adapter, which round-trips through
 * JSON. Used for tests and as the demo's default (ephemeral) backend.
 */
export class MemoryPageStorageAdapter implements PageStorageAdapter {
	private readonly records = new Map<string, PageRecord>();
	private readonly ctx: RecordOpsContext;

	constructor(options: MemoryPageStorageAdapterOptions = {}) {
		const now = options.now ?? (() => new Date());
		const idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.ctx = {
			nowIso: () => now().toISOString(),
			newId: idFactory,
		};
		const seeds = options.seed ?? [];
		for (const [index, seed] of seeds.entries()) {
			// Indexed, not id-keyed: a seed that is not a record has no usable id,
			// and "seed:undefined" names nothing the caller can go and look at.
			const record = requireStoredRecord(
				classifyStoredRecord(seed, `seed[${index}]`),
			);
			this.records.set(record.id, clone(record));
		}
	}

	async getById(id: string): Promise<PageRecord | null> {
		const record = this.records.get(id);
		return record === undefined ? null : clone(record);
	}

	async getBySlug(slug: string): Promise<PageRecord | null> {
		for (const record of this.records.values()) {
			if (record.slug === slug) return clone(record);
		}
		return null;
	}

	async list(params?: ListPagesParams): Promise<PageRecord[]> {
		return [...this.records.values()]
			.flatMap((record) => {
				if (params?.status !== undefined && record.status !== params.status) {
					return [];
				}
				if (
					params?.parentFolder !== undefined &&
					parentFolderOf(record) !== params.parentFolder
				) {
					return [];
				}
				return [clone(record)];
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	// Read, expected-revision check and write run synchronously with no
	// `await` between them, so two concurrent saves cannot both see the same
	// stored revision and both commit.
	async saveDraft(input: SaveDraftInput): Promise<PageRecord> {
		const existing = this.resolve(input.id, input.slug);
		assertExpectedPageRevision(existing, input.expectedPageRevision);
		return this.put(buildDraftRecord(existing, input, this.ctx), existing);
	}

	async publish(input: PublishPageInput): Promise<PageRecord> {
		const slug = input.slug ?? input.data.root?.props?.slug;
		const existing = this.resolve(input.id, slug);
		assertExpectedPageRevision(existing, input.expectedPageRevision);
		return this.put(buildPublishRecord(existing, input, this.ctx), existing);
	}

	async updateSettings(
		id: string,
		rootProps: PageRootProps,
		expectedPageRevision?: number,
	): Promise<PageRecord | null> {
		const existing = this.records.get(id);
		if (existing === undefined) return null;
		assertExpectedPageRevision(existing, expectedPageRevision);
		return this.put(applySettings(existing, rootProps, this.ctx), existing);
	}

	async archive(id: string): Promise<PageRecord | null> {
		const existing = this.records.get(id);
		if (existing === undefined) return null;
		return this.put(applyArchive(existing, this.ctx), existing);
	}

	async delete(id: string, expectedPageRevision?: number): Promise<void> {
		const existing = this.records.get(id);
		if (existing === undefined) return;
		assertExpectedPageRevision(existing, expectedPageRevision);
		this.records.delete(id);
	}

	async duplicate(
		id: string,
		input?: DuplicatePageInput,
	): Promise<PageRecord | null> {
		const source = this.records.get(id);
		if (source === undefined) return null;
		return this.put(buildDuplicate(source, input, this.ctx), null);
	}

	async getVersion(
		pageId: string,
		version: string,
	): Promise<PageRecord | null> {
		const record = this.records.get(pageId);
		if (record === undefined || record.version !== version) return null;
		return clone(record);
	}

	/**
	 * The adapter's single persistence funnel — and therefore its single
	 * `schemaRevision` and `pageRevision` stamp. All five write paths
	 * (`saveDraft`, `publish`, `updateSettings`, `archive`, `duplicate`) route
	 * through it, and none of them can bypass it: `record-ops` hands back an
	 * {@link UnstampedPageRecord}, which only `stampSchemaRevision` can turn
	 * into a storable {@link PageRecord}. `previous` is the record the caller
	 * read for this write (`null` when creating), whose page revision the new
	 * record advances.
	 */
	private put(
		draft: UnstampedPageRecord,
		previous: PageRecord | null,
	): PageRecord {
		const record = stampSchemaRevision(draft, previous);
		this.records.set(record.id, clone(record));
		return record;
	}

	private resolve(
		id: string | undefined,
		slug: string | undefined,
	): PageRecord | null {
		if (id !== undefined) {
			const byId = this.records.get(id);
			if (byId !== undefined) return clone(byId);
		}
		if (slug !== undefined && slug.length > 0) {
			for (const record of this.records.values()) {
				if (record.slug === slug) return clone(record);
			}
		}
		return null;
	}
}

function parentFolderOf(record: PageRecord): string | undefined {
	const props = (record.published ?? record.draft)?.root?.props as
		| PageRootProps
		| undefined;
	return props?.parentFolder;
}
