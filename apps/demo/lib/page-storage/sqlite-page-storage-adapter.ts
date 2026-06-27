import type { PageRootProps } from "@anvilkit/schema";
import { eq } from "drizzle-orm";
import { type DemoDb, getDb } from "../db/client";
import { pages } from "../db/schema";
import {
	applyArchive,
	applySettings,
	buildDraftRecord,
	buildDuplicate,
	buildPublishRecord,
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

export interface SqlitePageStorageAdapterOptions {
	/** Injectable Drizzle handle (tests pass an in-memory DB). Defaults to {@link getDb}. */
	db?: DemoDb;
	/** Injectable clock for deterministic timestamps in tests. */
	now?: () => Date;
	/** Injectable id factory for deterministic ids in tests. */
	idFactory?: () => string;
}

/**
 * Durable {@link PageStorageAdapter} backed by SQLite (Drizzle + better-sqlite3).
 * Structurally identical to {@link FileSystemPageStorageAdapter}: the same
 * `record-ops` helpers build every next record, and the whole {@link PageRecord}
 * is serialized into the `pages.data` column (one row per record). `slug` and
 * `status` are mirrored into indexed columns for query pushdown; everything
 * else is read back off the serialized record, so draft/publish/archive/version
 * semantics can never diverge from the other two backends.
 */
export class SqlitePageStorageAdapter implements PageStorageAdapter {
	private readonly db: DemoDb;
	private readonly ctx: RecordOpsContext;

	constructor(options: SqlitePageStorageAdapterOptions = {}) {
		this.db = options.db ?? getDb();
		const now = options.now ?? (() => new Date());
		const idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.ctx = { nowIso: () => now().toISOString(), newId: idFactory };
	}

	async getById(id: string): Promise<PageRecord | null> {
		const row = this.db
			.select({ data: pages.data })
			.from(pages)
			.where(eq(pages.id, id))
			.get();
		return row ? deserialize(row.data) : null;
	}

	async getBySlug(slug: string): Promise<PageRecord | null> {
		const row = this.db
			.select({ data: pages.data })
			.from(pages)
			.where(eq(pages.slug, slug))
			.get();
		return row ? deserialize(row.data) : null;
	}

	async list(params?: ListPagesParams): Promise<PageRecord[]> {
		return this.db
			.select({ data: pages.data })
			.from(pages)
			.all()
			.map((row) => deserialize(row.data))
			.filter((record) => {
				if (params?.status !== undefined && record.status !== params.status) {
					return false;
				}
				if (
					params?.parentFolder !== undefined &&
					parentFolderOf(record) !== params.parentFolder
				) {
					return false;
				}
				return true;
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async saveDraft(input: SaveDraftInput): Promise<PageRecord> {
		const existing = await this.resolve(input.id, input.slug);
		const record = buildDraftRecord(existing, input, this.ctx);
		this.writeRecord(record);
		return record;
	}

	async publish(input: PublishPageInput): Promise<PageRecord> {
		const slug = input.slug ?? input.data.root?.props?.slug;
		const existing = await this.resolve(input.id, slug);
		const record = buildPublishRecord(existing, input, this.ctx);
		this.writeRecord(record);
		return record;
	}

	async updateSettings(
		id: string,
		rootProps: PageRootProps,
	): Promise<PageRecord | null> {
		const existing = await this.getById(id);
		if (existing === null) return null;
		const record = applySettings(existing, rootProps, this.ctx);
		this.writeRecord(record);
		return record;
	}

	async archive(id: string): Promise<PageRecord | null> {
		const existing = await this.getById(id);
		if (existing === null) return null;
		const record = applyArchive(existing, this.ctx);
		this.writeRecord(record);
		return record;
	}

	async delete(id: string): Promise<void> {
		this.db.delete(pages).where(eq(pages.id, id)).run();
	}

	async duplicate(
		id: string,
		input?: DuplicatePageInput,
	): Promise<PageRecord | null> {
		const source = await this.getById(id);
		if (source === null) return null;
		const record = buildDuplicate(source, input, this.ctx);
		this.writeRecord(record);
		return record;
	}

	async getVersion(
		pageId: string,
		version: string,
	): Promise<PageRecord | null> {
		const record = await this.getById(pageId);
		if (record === null || record.version !== version) return null;
		return record;
	}

	private async resolve(
		id: string | undefined,
		slug: string | undefined,
	): Promise<PageRecord | null> {
		if (id !== undefined) {
			const byId = await this.getById(id);
			if (byId !== null) return byId;
		}
		if (slug !== undefined && slug.length > 0) {
			return this.getBySlug(slug);
		}
		return null;
	}

	private writeRecord(record: PageRecord): void {
		const row = {
			id: record.id,
			slug: record.slug,
			status: record.status,
			updatedAt: record.updatedAt,
			data: JSON.stringify(record),
		};
		this.db
			.insert(pages)
			.values(row)
			.onConflictDoUpdate({
				target: pages.id,
				set: {
					slug: row.slug,
					status: row.status,
					updatedAt: row.updatedAt,
					data: row.data,
				},
			})
			.run();
	}
}

function deserialize(data: string): PageRecord {
	return JSON.parse(data) as PageRecord;
}

function parentFolderOf(record: PageRecord): string | undefined {
	const props = (record.published ?? record.draft)?.root?.props as
		| PageRootProps
		| undefined;
	return props?.parentFolder;
}
