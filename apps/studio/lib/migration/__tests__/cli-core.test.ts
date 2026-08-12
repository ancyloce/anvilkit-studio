/**
 * @file P5-02 — migration CLI core suite (PLAN-0025 §10.3), including
 * the §14.5 backup-and-restore drill. Runs against the real memory
 * adapter and the real migration function (via `@anvilkit/core`
 * dist): dry-run default, per-payload hashes, no-write-on-fail, CAS,
 * snapshot-before-write, divergent-draft preservation, archived
 * isolation, and idempotent re-runs.
 */

import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { MemoryPageStorageAdapter } from "../../page-storage/memory-page-storage-adapter";
import type {
	DemoPageData,
	PageStorageAdapter,
} from "../../page-storage/types";
import {
	hashPayload,
	type MigrationCliDeps,
	migrateStore,
	restoreFromManifest,
	type SnapshotStore,
} from "../cli-core";

// The sidecar carrier key (`@anvilkit/contracts` is not a studio
// dependency; the literal is the contract's frozen value).
const ANVILKIT_AUTHORING_KEY = "__anvilkit";

const config = {
	components: {
		Box: {
			fields: { label: { type: "text" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								responsive: true,
								properties: ["display", "opacity"],
							},
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

const sidecar = {
	version: "1",
	revision: 1,
	breakpoints: [],
	nodes: {
		"box-1": {
			version: "1",
			name: "Box",
			layout: { base: { display: "flex" } },
		},
	},
	tokens: {},
	tokenModes: {},
	styleDefinitions: {},
	componentDefinitions: {},
	interactions: {},
	bindings: {},
};

const rootProps = (slug: string, extra: Record<string, unknown> = {}) => ({
	title: `Page ${slug}`,
	slug,
	status: "published" as const,
	version: "1.0.0",
	parentFolder: "/",
	seo: { noIndex: false },
	...extra,
});

const legacyDoc = (slug: string): DemoPageData =>
	({
		content: [{ type: "Box", props: { id: "box-1", label: "hello" } }],
		root: {
			props: rootProps(slug, { [ANVILKIT_AUTHORING_KEY]: sidecar }),
		},
		zones: {},
	}) as unknown as DemoPageData;

/**
 * An already-canonical document: no sidecar, and since `p7-002` no
 * version marker either — a canonical document is recognised by what it
 * lacks, not by a stamp it carries. `rootProps`' own `version` is the
 * author-facing product version and is deliberately left in place: it
 * is not on a carrier, so finalization must not touch it.
 */
const v2Doc = (slug: string, label = "v2-draft"): DemoPageData =>
	({
		content: [{ type: "Box", props: { id: "box-1", label } }],
		root: { props: rootProps(slug) },
		zones: {},
	}) as unknown as DemoPageData;

/** A blocked document: duplicate node ids. */
const blockedDoc = (slug: string): DemoPageData =>
	({
		content: [
			{ type: "Box", props: { id: "dup", label: "a" } },
			{ type: "Box", props: { id: "dup", label: "b" } },
		],
		root: {
			props: rootProps(slug, { [ANVILKIT_AUTHORING_KEY]: sidecar }),
		},
		zones: {},
	}) as unknown as DemoPageData;

function memorySnapshots(): SnapshotStore & {
	entries: Map<string, string>;
} {
	const entries = new Map<string, string>();
	return {
		entries,
		write: async (name, content) => {
			entries.set(name, content);
			return name;
		},
		read: async (address) => {
			const found = entries.get(address);
			if (found === undefined) throw new Error(`missing snapshot ${address}`);
			return found;
		},
	};
}

let counter = 0;
function makeDeps(storage?: PageStorageAdapter): MigrationCliDeps & {
	snapshots: ReturnType<typeof memorySnapshots>;
	storage: PageStorageAdapter;
} {
	counter = 0;
	return {
		storage:
			storage ??
			new MemoryPageStorageAdapter({ idFactory: () => `id-${++counter}` }),
		config,
		snapshots: memorySnapshots(),
		nowIso: () => "2026-08-05T12:00:00.000Z",
	};
}

const propsOfRoot = (data: DemoPageData | undefined) =>
	(data?.root?.props ?? {}) as Record<string, unknown>;

describe("migrateStore — §10.3", () => {
	it("dry-run is the default analysis: hashes reported, nothing written, no snapshots", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "p1", data: legacyDoc("p1") });
		const before = JSON.stringify(await deps.storage.getBySlug("p1"));

		const report = await migrateStore(deps, {
			write: false,
			selection: { all: true },
		});
		expect(report.mode).toBe("dry-run");
		expect(report.total).toBe(1);
		expect(report.migratable).toBe(1);
		expect(report.errorCount).toBe(0);
		const payloads = report.records[0]?.payloads;
		expect(payloads?.published?.status).toBe("migrated");
		expect(payloads?.published?.oldHash).toHaveLength(64);
		expect(payloads?.published?.newHash).toHaveLength(64);
		expect(payloads?.published?.cssHash).toHaveLength(64);
		expect(JSON.stringify(await deps.storage.getBySlug("p1"))).toBe(before);
		expect(deps.snapshots.entries.size).toBe(0);
	});

	it("write mode migrates the store, snapshotting each record first", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "p1", data: legacyDoc("p1") });

		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(report.written).toBe(1);
		expect(report.errorCount).toBe(0);

		const record = await deps.storage.getBySlug("p1");
		const published = propsOfRoot(record?.published);
		expect(published[ANVILKIT_AUTHORING_KEY]).toBeUndefined();
		// `p7-002`: the migration leaves NO version marker behind. It also
		// leaves the author-facing product version alone.
		expect(published.authoringSchemaVersion).toBeUndefined();
		expect(published.version).toBe("1.0.0");
		// The §5.1 carrier landed on the node.
		const publishedDoc = record?.published as
			| { content: { props: Record<string, unknown> }[] }
			| undefined;
		const node = publishedDoc?.content[0];
		expect(node?.props.appearance).toMatchObject({
			targets: { root: { style: { base: { layout: { display: "flex" } } } } },
		});
		// Snapshot holds the ORIGINAL legacy bytes.
		const snapshotAddress = report.records[0]?.snapshot as string;
		const snapshot = JSON.parse(await deps.snapshots.read(snapshotAddress));
		expect(
			(snapshot.published.root.props as Record<string, unknown>)[
				ANVILKIT_AUTHORING_KEY
			],
		).toBeDefined();
	});

	it("re-running after a write reports already-v2 and writes nothing (idempotent)", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "p1", data: legacyDoc("p1") });
		await migrateStore(deps, { write: true, selection: { all: true } });
		const afterFirst = JSON.stringify(await deps.storage.getBySlug("p1"));
		deps.snapshots.entries.clear();

		const second = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(second.alreadyV2).toBe(1);
		expect(second.written).toBe(0);
		expect(second.errorCount).toBe(0);
		expect(deps.snapshots.entries.size).toBe(0);
		expect(JSON.stringify(await deps.storage.getBySlug("p1"))).toBe(afterFirst);
	});

	it("a blocked record writes nothing and drives the error count", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "bad", data: blockedDoc("bad") });
		const before = JSON.stringify(await deps.storage.getBySlug("bad"));

		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(report.blocked).toBe(1);
		expect(report.errorCount).toBe(1);
		expect(report.written).toBe(0);
		expect(deps.snapshots.entries.size).toBe(0);
		expect(JSON.stringify(await deps.storage.getBySlug("bad"))).toBe(before);
	});

	it("CAS: a record that moved between list and write is skipped as cas-conflict", async () => {
		const base = makeDeps();
		await base.storage.publish({ slug: "p1", data: legacyDoc("p1") });
		// Wrap the storage so getById reports a different updatedAt —
		// the concurrent-writer signature.
		const racing: PageStorageAdapter = Object.create(base.storage);
		racing.getById = async (id: string) => {
			const record = await base.storage.getById(id);
			return record === null
				? null
				: { ...record, updatedAt: "1999-01-01T00:00:00.000Z" };
		};
		const deps = { ...base, storage: racing };
		const before = JSON.stringify(await base.storage.getBySlug("p1"));

		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(report.casConflicts).toBe(1);
		expect(report.errorCount).toBe(1);
		expect(report.written).toBe(0);
		expect(JSON.stringify(await base.storage.getBySlug("p1"))).toBe(before);
	});

	it("preserves a divergent already-v2 draft that publish() would clobber", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "p1", data: legacyDoc("p1") });
		const draft = v2Doc("p1", "divergent-v2-draft");
		await deps.storage.saveDraft({ slug: "p1", data: draft });

		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(report.written).toBe(1);
		const record = await deps.storage.getBySlug("p1");
		// Published converted: sidecar gone, no marker in its place.
		expect(
			propsOfRoot(record?.published)[ANVILKIT_AUTHORING_KEY],
		).toBeUndefined();
		expect(
			propsOfRoot(record?.published).authoringSchemaVersion,
		).toBeUndefined();
		// …and the divergent canonical draft survived byte-equal.
		expect(hashPayload(record?.draft)).toBe(hashPayload(draft));
	});

	it("archived records are skipped as explicitly isolated", async () => {
		const deps = makeDeps();
		const record = await deps.storage.publish({
			slug: "old",
			data: legacyDoc("old"),
		});
		await deps.storage.archive(record.id);

		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(report.skippedArchived).toBe(1);
		expect(report.written).toBe(0);
		const archived = await deps.storage.getById(record.id);
		expect(
			propsOfRoot(archived?.published)[ANVILKIT_AUTHORING_KEY],
		).toBeDefined();
	});

	it("selection by slug narrows the run", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "a", data: legacyDoc("a") });
		await deps.storage.publish({ slug: "b", data: legacyDoc("b") });
		const report = await migrateStore(deps, {
			write: false,
			selection: { slug: "a" },
		});
		expect(report.total).toBe(1);
		expect(report.records[0]?.slug).toBe("a");
	});

	it("§14.5 backup-and-restore drill: write, verify v2, restore, verify original bytes", async () => {
		const deps = makeDeps();
		await deps.storage.publish({ slug: "p1", data: legacyDoc("p1") });
		const originalHash = hashPayload(
			(await deps.storage.getBySlug("p1"))?.published,
		);

		const manifest = await migrateStore(deps, {
			write: true,
			selection: { all: true },
		});
		expect(
			propsOfRoot((await deps.storage.getBySlug("p1"))?.published)
				.authoringSchemaVersion,
		).toBe(2);

		const restore = await restoreFromManifest(deps, manifest);
		expect(restore).toEqual({ restored: 1, missing: 0 });
		const restored = await deps.storage.getBySlug("p1");
		expect(hashPayload(restored?.published)).toBe(originalHash);
		expect(
			propsOfRoot(restored?.published)[ANVILKIT_AUTHORING_KEY],
		).toBeDefined();
	});

	it("bounded concurrency processes every record", async () => {
		const deps = makeDeps();
		for (const slug of ["a", "b", "c", "d", "e"]) {
			await deps.storage.publish({ slug, data: legacyDoc(slug) });
		}
		const report = await migrateStore(deps, {
			write: true,
			selection: { all: true },
			concurrency: 2,
		});
		expect(report.total).toBe(5);
		expect(report.written).toBe(5);
		expect(report.errorCount).toBe(0);
	});
});
