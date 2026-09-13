import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { PageRootProps } from "@anvilkit/schema";
import {
	applyArchive,
	applySettings,
	buildDraftRecord,
	buildDuplicate,
	buildPublishRecord,
	type RecordOpsContext,
} from "./record-ops";
import {
	classifyStoredRecordJson,
	requireStoredRecord,
	stampSchemaRevision,
	tolerateStoredRecord,
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

export interface FileSystemPageStorageAdapterOptions {
	/** Directory under which one `<id>.json` file is stored per page record. */
	dir: string;
	now?: () => Date;
	idFactory?: () => string;
}

/**
 * Durable {@link PageStorageAdapter} that persists one JSON file per record at
 * `<dir>/<id>.json`. Draft and published payloads are kept as distinct keys
 * within the record, so the public route always renders the last published
 * document. Writes are atomic (temp file + `rename`) so a crash mid-write never
 * yields a half-written page. Survives server restarts. Slug/list lookups scan
 * the directory (O(n) — adequate at demo scale; a slug→id index is a follow-up).
 */
export class FileSystemPageStorageAdapter implements PageStorageAdapter {
	private readonly dir: string;
	private readonly ctx: RecordOpsContext;
	/**
	 * Every mutating path runs through this promise chain, so a read, its
	 * expected-revision check and the rename that commits the write are never
	 * interleaved with another write of this process (the demo's single-server
	 * deployment; a second process writing the same directory is not covered).
	 */
	private writes: Promise<unknown> = Promise.resolve();

	constructor(options: FileSystemPageStorageAdapterOptions) {
		this.dir = options.dir;
		const now = options.now ?? (() => new Date());
		const idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.ctx = { nowIso: () => now().toISOString(), newId: idFactory };
	}

	async getById(id: string): Promise<PageRecord | null> {
		return this.readRecord(id);
	}

	async getBySlug(slug: string): Promise<PageRecord | null> {
		const all = await this.readAll();
		return all.find((record) => record.slug === slug) ?? null;
	}

	async list(params?: ListPagesParams): Promise<PageRecord[]> {
		const all = await this.readAll();
		return all
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
		return this.serialized(async () => {
			const existing = await this.resolve(input.id, input.slug);
			assertExpectedPageRevision(existing, input.expectedPageRevision);
			return this.writeRecord(
				buildDraftRecord(existing, input, this.ctx),
				existing,
			);
		});
	}

	async publish(input: PublishPageInput): Promise<PageRecord> {
		const slug = input.slug ?? input.data.root?.props?.slug;
		return this.serialized(async () => {
			const existing = await this.resolve(input.id, slug);
			assertExpectedPageRevision(existing, input.expectedPageRevision);
			return this.writeRecord(
				buildPublishRecord(existing, input, this.ctx),
				existing,
			);
		});
	}

	async updateSettings(
		id: string,
		rootProps: PageRootProps,
		expectedPageRevision?: number,
	): Promise<PageRecord | null> {
		return this.serialized(async () => {
			const existing = await this.readRecord(id);
			if (existing === null) return null;
			assertExpectedPageRevision(existing, expectedPageRevision);
			return this.writeRecord(
				applySettings(existing, rootProps, this.ctx),
				existing,
			);
		});
	}

	async archive(id: string): Promise<PageRecord | null> {
		return this.serialized(async () => {
			const existing = await this.readRecord(id);
			if (existing === null) return null;
			return this.writeRecord(applyArchive(existing, this.ctx), existing);
		});
	}

	async delete(id: string, expectedPageRevision?: number): Promise<void> {
		return this.serialized(async () => {
			const existing = await this.readRecord(id);
			if (existing === null) return;
			assertExpectedPageRevision(existing, expectedPageRevision);
			await rm(this.filePath(id), { force: true });
		});
	}

	async duplicate(
		id: string,
		input?: DuplicatePageInput,
	): Promise<PageRecord | null> {
		return this.serialized(async () => {
			const source = await this.readRecord(id);
			if (source === null) return null;
			return this.writeRecord(buildDuplicate(source, input, this.ctx), null);
		});
	}

	/** Queue `work` behind every earlier write; its failure never breaks the chain. */
	private serialized<T>(work: () => Promise<T>): Promise<T> {
		const run = this.writes.then(work, work);
		this.writes = run.catch(() => undefined);
		return run;
	}

	async getVersion(
		pageId: string,
		version: string,
	): Promise<PageRecord | null> {
		const record = await this.readRecord(pageId);
		if (record === null || record.version !== version) return null;
		return record;
	}

	private filePath(id: string): string {
		return join(this.dir, `${encodeURIComponent(id)}.json`);
	}

	private async resolve(
		id: string | undefined,
		slug: string | undefined,
	): Promise<PageRecord | null> {
		if (id !== undefined) {
			const byId = await this.readRecord(id);
			if (byId !== null) return byId;
		}
		if (slug !== undefined && slug.length > 0) {
			return this.getBySlug(slug);
		}
		return null;
	}

	/**
	 * Addressed read. `null` means "no such file"; a file that exists but is not
	 * a readable record throws {@link CorruptPageRecordError} rather than
	 * reading as missing, and a record below the revision floor loads through
	 * the migration path instead of being mistaken for either.
	 */
	private async readRecord(id: string): Promise<PageRecord | null> {
		let raw: string;
		try {
			raw = await readFile(this.filePath(id), "utf8");
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
		return requireStoredRecord(
			classifyStoredRecordJson(raw, this.filePath(id)),
		);
	}

	private async readAll(): Promise<PageRecord[]> {
		let entries: string[];
		try {
			entries = await readdir(this.dir);
		} catch (error) {
			if (isNotFound(error)) return [];
			throw error;
		}
		const readEntry = async (entry: string): Promise<PageRecord | null> => {
			const path = join(this.dir, entry);
			let raw: string;
			try {
				raw = await readFile(path, "utf8");
			} catch {
				// Skip unreadable/partial files rather than failing the whole list.
				return null;
			}
			// A scan tolerates a corrupt entry (reported, then skipped) and still
			// serves a below-floor one; neither may take down the whole listing.
			return tolerateStoredRecord(classifyStoredRecordJson(raw, path));
		};
		const results = await Promise.all(
			entries.flatMap((entry) =>
				entry.endsWith(".json") && !entry.endsWith(".tmp")
					? [readEntry(entry)]
					: [],
			),
		);
		return results.filter((record): record is PageRecord => record !== null);
	}

	/**
	 * The adapter's single persistence funnel — and therefore its single
	 * `schemaRevision` and `pageRevision` stamp. All five write paths
	 * (`saveDraft`, `publish`, `updateSettings`, `archive`, `duplicate`) route
	 * through it, and none of them can bypass it: `record-ops` hands back an
	 * {@link UnstampedPageRecord}, which only `stampSchemaRevision` can turn
	 * into a storable {@link PageRecord}. `previous` is the record read under
	 * the write queue (`null` when creating).
	 */
	private async writeRecord(
		draft: UnstampedPageRecord,
		previous: PageRecord | null,
	): Promise<PageRecord> {
		const record = stampSchemaRevision(draft, previous);
		await mkdir(this.dir, { recursive: true });
		const finalPath = this.filePath(record.id);
		const tempPath = `${finalPath}.${this.ctx.newId()}.tmp`;
		await writeFile(tempPath, JSON.stringify(record, null, 2), "utf8");
		await rename(tempPath, finalPath);
		return record;
	}
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: string }).code === "ENOENT"
	);
}

function parentFolderOf(record: PageRecord): string | undefined {
	const props = (record.published ?? record.draft)?.root?.props as
		| PageRootProps
		| undefined;
	return props?.parentFolder;
}
