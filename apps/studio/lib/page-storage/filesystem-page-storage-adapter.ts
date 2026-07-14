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
import type {
	DuplicatePageInput,
	ListPagesParams,
	PageRecord,
	PageStorageAdapter,
	PublishPageInput,
	SaveDraftInput,
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
		const existing = await this.resolve(input.id, input.slug);
		const record = buildDraftRecord(existing, input, this.ctx);
		await this.writeRecord(record);
		return record;
	}

	async publish(input: PublishPageInput): Promise<PageRecord> {
		const slug = input.slug ?? input.data.root?.props?.slug;
		const existing = await this.resolve(input.id, slug);
		const record = buildPublishRecord(existing, input, this.ctx);
		await this.writeRecord(record);
		return record;
	}

	async updateSettings(
		id: string,
		rootProps: PageRootProps,
	): Promise<PageRecord | null> {
		const existing = await this.readRecord(id);
		if (existing === null) return null;
		const record = applySettings(existing, rootProps, this.ctx);
		await this.writeRecord(record);
		return record;
	}

	async archive(id: string): Promise<PageRecord | null> {
		const existing = await this.readRecord(id);
		if (existing === null) return null;
		const record = applyArchive(existing, this.ctx);
		await this.writeRecord(record);
		return record;
	}

	async delete(id: string): Promise<void> {
		await rm(this.filePath(id), { force: true });
	}

	async duplicate(
		id: string,
		input?: DuplicatePageInput,
	): Promise<PageRecord | null> {
		const source = await this.readRecord(id);
		if (source === null) return null;
		const record = buildDuplicate(source, input, this.ctx);
		await this.writeRecord(record);
		return record;
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

	private async readRecord(id: string): Promise<PageRecord | null> {
		try {
			const raw = await readFile(this.filePath(id), "utf8");
			return JSON.parse(raw) as PageRecord;
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
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
			try {
				const raw = await readFile(join(this.dir, entry), "utf8");
				return JSON.parse(raw) as PageRecord;
			} catch {
				// Skip unreadable/partial files rather than failing the whole list.
				return null;
			}
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

	private async writeRecord(record: PageRecord): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		const finalPath = this.filePath(record.id);
		const tempPath = `${finalPath}.${this.ctx.newId()}.tmp`;
		await writeFile(tempPath, JSON.stringify(record, null, 2), "utf8");
		await rename(tempPath, finalPath);
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
