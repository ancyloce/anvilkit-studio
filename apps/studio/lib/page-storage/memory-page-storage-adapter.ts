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
import type {
	DuplicatePageInput,
	ListPagesParams,
	PageRecord,
	PageStorageAdapter,
	PublishPageInput,
	SaveDraftInput,
} from "./types";

export interface MemoryPageStorageAdapterOptions {
	/** Seed records (cloned on construction). */
	seed?: readonly PageRecord[];
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
		for (const record of options.seed ?? []) {
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

	async saveDraft(input: SaveDraftInput): Promise<PageRecord> {
		const existing = await this.resolve(input.id, input.slug);
		const record = buildDraftRecord(existing, input, this.ctx);
		this.records.set(record.id, clone(record));
		return record;
	}

	async publish(input: PublishPageInput): Promise<PageRecord> {
		const slug = input.slug ?? input.data.root?.props?.slug;
		const existing = await this.resolve(input.id, slug);
		const record = buildPublishRecord(existing, input, this.ctx);
		this.records.set(record.id, clone(record));
		return record;
	}

	async updateSettings(
		id: string,
		rootProps: PageRootProps,
	): Promise<PageRecord | null> {
		const existing = this.records.get(id);
		if (existing === undefined) return null;
		const record = applySettings(existing, rootProps, this.ctx);
		this.records.set(record.id, clone(record));
		return record;
	}

	async archive(id: string): Promise<PageRecord | null> {
		const existing = this.records.get(id);
		if (existing === undefined) return null;
		const record = applyArchive(existing, this.ctx);
		this.records.set(record.id, clone(record));
		return record;
	}

	async delete(id: string): Promise<void> {
		this.records.delete(id);
	}

	async duplicate(
		id: string,
		input?: DuplicatePageInput,
	): Promise<PageRecord | null> {
		const source = this.records.get(id);
		if (source === undefined) return null;
		const record = buildDuplicate(source, input, this.ctx);
		this.records.set(record.id, clone(record));
		return record;
	}

	async getVersion(
		pageId: string,
		version: string,
	): Promise<PageRecord | null> {
		const record = this.records.get(pageId);
		if (record === undefined || record.version !== version) return null;
		return clone(record);
	}

	private async resolve(
		id: string | undefined,
		slug: string | undefined,
	): Promise<PageRecord | null> {
		if (id !== undefined) {
			const byId = this.records.get(id);
			if (byId !== undefined) return clone(byId);
		}
		if (slug !== undefined && slug.length > 0) {
			return this.getBySlug(slug);
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
