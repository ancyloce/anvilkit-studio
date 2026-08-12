/**
 * @file `p7-002` — the store-finalization runner (PLAN-0026 §5, §4 R6).
 *
 * Code changes made the three version markers *unwritten*. Only this
 * makes them **absent**:
 *
 * - `root.props.authoringSchemaVersion` (`p1-001`),
 * - every carrier `version` — `appearance`, `designSystem`,
 *   `componentLibrary` (`p1-006`),
 * - the `__anvilkitInstance` node prop, renamed to
 *   `anvilComponentInstance` (`p3-003`).
 *
 * ```bash
 * pnpm --filter studio finalize:store --all                       # dry run (default)
 * pnpm --filter studio finalize:store --all --write
 * pnpm --filter studio finalize:store --all --report ./artifacts/finalize.json
 * pnpm --filter studio finalize:store --kv ./copy/version-history.json --write
 * pnpm --filter studio finalize:store --pages ./copy/pages --kv ./copy/collab.json --write
 * ```
 *
 * ## One pass, every surface — because a snapshot is a document too
 *
 * A migrated document whose history snapshots are not migrated produces
 * a restore that puts the markers straight back, which is how a
 * *completed* migration comes back. So documents and snapshots are
 * finalized in the **same run**, and the way that is made tractable is
 * an observation about how all of them are actually stored:
 *
 * | Surface | Address | Value |
 * |---|---|---|
 * | page records, filesystem adapter | `<dir>/<id>.json` | a `PageRecord` as JSON |
 * | page records, sqlite adapter | `pages.id` | a `PageRecord` in `pages.data`, as JSON |
 * | version-history snapshots | `<ns>:snapshots:<id>` (`localStorage`) | a keyframe or delta `StoredRecord`, as JSON |
 * | collab-persisted snapshots | `snapshotMeta:<id>` / `snapshotPayload:<id>` (a `Y.Map<string>`) | a `SnapshotMeta` or an encoded payload, as JSON |
 *
 * Every one of them is an **addressed JSON string**. So there is one
 * transform — parse, {@link finalizeStoredDocument}, re-serialize — and
 * three ways to enumerate addresses ({@link JsonStore}). A key/value
 * surface exported to a file (`--kv`) covers both snapshot stores,
 * because `localStorage` and a `Y.Map<string>` are the same shape once
 * dumped.
 *
 * The finalization itself lives in `@anvilkit/core`
 * (`migrations/finalize-document.ts`) and is shared with the v1→v2
 * migration and with the store loader's below-floor read path. One
 * definition of "finalized", three callers: a document rewritten here
 * and a document repaired on read cannot disagree.
 *
 * ## `schemaRevision`
 *
 * A rewritten page record is re-stamped through `stampSchemaRevision`,
 * the store's single revision writer, so it lands at
 * `STORE_SCHEMA_REVISION` (2) and `p7-001`'s three-way loader can tell a
 * finalized record from an unfinalized one. Snapshot surfaces carry no
 * record envelope and therefore no revision — for those, absence of the
 * markers is the whole acceptance criterion.
 *
 * ## Idempotence
 *
 * `finalizeStoredDocument` returns its input **by reference** when it
 * changes nothing, so a second run reports zero changed addresses
 * without a deep comparison, and `--write` rewrites nothing.
 *
 * ## Out of contract: external artifacts
 *
 * PLAN-0026 §5, restated here because this is the command that draws
 * the line. **A document that is not in a surface passed to this run is
 * not migrated by it.** That includes downloaded exports, off-store
 * backups, files a user saved to disk, a browser `localStorage` on a
 * machine that never opens the app again, and any copy taken before the
 * run. Those artifacts are **out of contract**: they are not corrupt,
 * they are pre-finalization, and after `p7-004` no runtime code reads
 * that form.
 *
 * Out of contract is not out of reach. `p7-004` tags a recovery release
 * carrying this command, and running it against a stray artifact — dump
 * it to a `--kv` file or a `--pages` directory first — remains the
 * supported way to bring one forward. What is not supported is loading
 * one directly into a finalized runtime; the store loader will report it
 * as below-floor and repair it in memory, but nothing writes that repair
 * back except a real write or this runner.
 *
 * ## Lifetime — NOT deleted by `p7-004`
 *
 * `p7-004` deletes the *v1→v2 migration layer*:
 * `core/src/migrations/puck-native-v2.ts`, `legacy-sidecar.ts`,
 * `apps/studio/lib/migration/*` and `scripts/migrate-puck-native-v2.ts`.
 * This file is not part of it. It is the finalization runner the
 * recovery release ships and the below-floor policy points at, and it
 * shares nothing with the sidecar conversion.
 *
 * Runs under `tsx`. Unlike `migrate-puck-native-v2.ts` it needs **no
 * Puck config**: the transform is pure JSON, so there is no component
 * source to load and no CSS hook to register.
 */

import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	addDocumentMarkers,
	type DocumentMarkerCounts,
	finalizeStoredDocument,
	NO_DOCUMENT_MARKERS,
	totalDocumentMarkers,
} from "@anvilkit/core/editor";

/**
 * One surface, reduced to what finalization needs: addresses, and a JSON
 * string at each. `write` is only ever called under `--write`.
 */
interface JsonStore {
	readonly kind: string;
	readonly label: string;
	addresses(): Promise<readonly string[]>;
	read(address: string): Promise<string>;
	write(address: string, content: string): Promise<void>;
	/** Persist any store-level bookkeeping after the per-address writes. */
	flush?(): Promise<void>;
}

interface AddressOutcome {
	readonly address: string;
	readonly status: "finalized" | "clean" | "unparseable";
	readonly removed: DocumentMarkerCounts;
	/** Set when the value was a page record and its revision moved. */
	readonly schemaRevision?: { readonly from: number; readonly to: number };
	readonly note?: string;
}

interface SurfaceReport {
	readonly kind: string;
	readonly label: string;
	readonly total: number;
	readonly finalized: number;
	readonly clean: number;
	readonly unparseable: number;
	readonly removed: DocumentMarkerCounts;
	readonly addresses: readonly AddressOutcome[];
}

interface RunReport {
	readonly runId: string;
	readonly mode: "dry-run" | "write";
	readonly storeSchemaRevision: number;
	readonly total: number;
	readonly finalized: number;
	readonly clean: number;
	readonly unparseable: number;
	readonly removed: DocumentMarkerCounts;
	readonly surfaces: readonly SurfaceReport[];
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** The filesystem page-record layout: one `<id>.json` per record. */
function fileJsonStore(dir: string): JsonStore {
	return {
		kind: "pages",
		label: dir,
		async addresses() {
			const entries = await readdir(dir).catch((error: unknown) => {
				if ((error as { code?: string }).code === "ENOENT")
					return [] as string[];
				throw error;
			});
			return entries
				.filter((entry) => entry.endsWith(".json") && !entry.endsWith(".tmp"))
				.sort()
				.map((entry) => join(dir, entry));
		},
		read: (address) => readFile(address, "utf8"),
		async write(address, content) {
			// Same atomic temp+rename the adapter uses, so a crash mid-run
			// never leaves a half-written record.
			const temp = `${address}.${crypto.randomUUID()}.tmp`;
			await writeFile(temp, content, "utf8");
			await rename(temp, address);
		},
	};
}

/**
 * A flat `{ address: jsonString }` map exported from a key/value store —
 * a browser `localStorage` dump (version-history) or a `Y.Map<string>`
 * dump (collab snapshots). Loaded whole, rewritten whole on `flush`.
 */
async function kvJsonStore(path: string): Promise<JsonStore> {
	const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(
			`--kv ${path}: expected a JSON object mapping keys to stored JSON strings.`,
		);
	}
	const map = parsed as Record<string, unknown>;
	let dirty = false;
	return {
		kind: "kv",
		label: path,
		async addresses() {
			return Object.keys(map)
				.filter((key) => typeof map[key] === "string")
				.sort();
		},
		async read(address) {
			return map[address] as string;
		},
		async write(address, content) {
			map[address] = content;
			dirty = true;
		},
		async flush() {
			if (!dirty) return;
			const temp = `${path}.${crypto.randomUUID()}.tmp`;
			await writeFile(temp, `${JSON.stringify(map, null, "\t")}\n`, "utf8");
			await rename(temp, path);
		},
	};
}

/**
 * The sqlite page table. Deferred import: `better-sqlite3` must not load
 * for a run that never touches it.
 */
async function sqliteJsonStore(): Promise<JsonStore> {
	const [{ getDb }, { pages }, { eq }] = await Promise.all([
		import("../lib/db/client"),
		import("../lib/db/schema"),
		import("drizzle-orm"),
	]);
	const db = getDb();
	return {
		kind: "pages",
		label: "sqlite:pages",
		async addresses() {
			return db
				.select({ id: pages.id })
				.from(pages)
				.all()
				.map((row) => row.id)
				.sort();
		},
		async read(address) {
			const row = db
				.select({ data: pages.data })
				.from(pages)
				.where(eq(pages.id, address))
				.get();
			if (row === undefined) throw new Error(`pages.id=${address} vanished`);
			return row.data;
		},
		async write(address, content) {
			db.update(pages)
				.set({ data: content })
				.where(eq(pages.id, address))
				.run();
		},
	};
}

/* ------------------------------------------------------------------ */
/* The transform                                                       */
/* ------------------------------------------------------------------ */

/**
 * Is this parsed value a page record? The same field set
 * `schema-revision.ts` checks, and for the same reason: `schemaRevision`
 * is deliberately excluded, because an unstamped record is exactly the
 * one this run exists to promote.
 */
function isPageRecordShape(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.slug === "string" &&
		typeof candidate.status === "string" &&
		typeof candidate.createdAt === "string" &&
		typeof candidate.updatedAt === "string"
	);
}

async function runSurface(
	store: JsonStore,
	write: boolean,
	stamp: (record: Record<string, unknown>) => Record<string, unknown>,
	currentRevision: number,
): Promise<SurfaceReport> {
	const addresses = await store.addresses();
	const outcomes: AddressOutcome[] = [];

	for (const address of addresses) {
		const raw = await store.read(address);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			// Never guessed at, never dropped: an unparseable value is
			// reported and left byte-identical. A migration that silently
			// rewrites what it could not read is worse than one that stops.
			outcomes.push({
				address,
				status: "unparseable",
				removed: NO_DOCUMENT_MARKERS,
				note: error instanceof Error ? error.message : String(error),
			});
			continue;
		}

		const finalized = finalizeStoredDocument(parsed);
		const record = isPageRecordShape(finalized.value)
			? (finalized.value as Record<string, unknown>)
			: undefined;
		const foundRevision =
			record !== undefined && typeof record.schemaRevision === "number"
				? record.schemaRevision
				: 0;
		const needsStamp =
			record !== undefined && foundRevision !== currentRevision;

		if (!finalized.changed && !needsStamp) {
			outcomes.push({
				address,
				status: "clean",
				removed: NO_DOCUMENT_MARKERS,
			});
			continue;
		}

		const next = needsStamp
			? stamp(record as Record<string, unknown>)
			: finalized.value;
		if (write) {
			await store.write(address, JSON.stringify(next, null, "\t"));
		}
		outcomes.push({
			address,
			status: "finalized",
			removed: finalized.removed,
			...(needsStamp
				? { schemaRevision: { from: foundRevision, to: currentRevision } }
				: {}),
		});
	}

	if (write && store.flush !== undefined) await store.flush();

	const count = (status: AddressOutcome["status"]): number =>
		outcomes.filter((outcome) => outcome.status === status).length;
	return {
		kind: store.kind,
		label: store.label,
		total: outcomes.length,
		finalized: count("finalized"),
		clean: count("clean"),
		unparseable: count("unparseable"),
		removed: outcomes.reduce(
			(total, outcome) => addDocumentMarkers(total, outcome.removed),
			NO_DOCUMENT_MARKERS,
		),
		addresses: outcomes,
	};
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

/** Write-freeze guard: a live dev server means writes are NOT frozen. */
function devServerHoldsPort(port: number): Promise<boolean> {
	return new Promise((resolvePort) => {
		const socket = connect({ port, host: "127.0.0.1" });
		const done = (result: boolean) => {
			socket.destroy();
			resolvePort(result);
		};
		socket.once("connect", () => done(true));
		socket.once("error", () => done(false));
		socket.setTimeout(1_500, () => done(false));
	});
}

function formatMarkers(counts: DocumentMarkerCounts): string {
	return (
		`authoringSchemaVersion=${counts.authoringSchemaVersion} · ` +
		`carrier version=${counts.appearanceVersion} · ` +
		`__anvilkitInstance=${counts.legacyInstanceProp}`
	);
}

function formatRunSummary(report: RunReport): string {
	const lines = [
		`finalize-store ${report.mode} — run ${report.runId}`,
		`store schema revision: ${report.storeSchemaRevision}`,
		`addresses: ${report.total} · finalized: ${report.finalized} · already clean: ${report.clean} · unparseable: ${report.unparseable}`,
		`markers removed: ${formatMarkers(report.removed)} (total ${totalDocumentMarkers(report.removed)})`,
	];
	for (const surface of report.surfaces) {
		lines.push(
			`  [${surface.kind}] ${surface.label}: ${surface.total} addresses · ${surface.finalized} finalized · ${surface.clean} clean · ${surface.unparseable} unparseable · ${formatMarkers(surface.removed)}`,
		);
		for (const outcome of surface.addresses) {
			if (outcome.status === "clean") continue;
			const revision =
				outcome.schemaRevision === undefined
					? ""
					: ` schemaRevision ${outcome.schemaRevision.from}→${outcome.schemaRevision.to}`;
			lines.push(
				`      ${outcome.status} ${outcome.address}: ${formatMarkers(outcome.removed)}${revision}${
					outcome.note === undefined ? "" : ` — ${outcome.note}`
				}`,
			);
		}
	}
	return lines.join("\n");
}

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			write: { type: "boolean", default: false },
			all: { type: "boolean", default: false },
			pages: { type: "string" },
			sqlite: { type: "boolean", default: false },
			kv: { type: "string", multiple: true, default: [] },
			report: { type: "string" },
		},
	});

	// `stampSchemaRevision` is the store's single revision writer; the
	// runner reaches for it rather than assigning the field, so this
	// command cannot drift from what an adapter write produces.
	const { STORE_SCHEMA_REVISION, stampSchemaRevision } = await import(
		"../lib/page-storage/schema-revision"
	);

	const stores: JsonStore[] = [];
	const backend = process.env.ANVILKIT_PAGE_STORAGE ?? "sqlite";

	if (values.pages !== undefined) {
		stores.push(fileJsonStore(resolve(values.pages)));
	}
	if (values.sqlite === true) {
		stores.push(await sqliteJsonStore());
	}
	for (const path of values.kv ?? []) {
		stores.push(await kvJsonStore(resolve(path)));
	}
	if (stores.length === 0 && values.all === true) {
		// `--all` means "the store this app is configured for", exactly the
		// backend selection `lib/page-storage` makes — and NO demo seeding.
		if (backend === "memory") {
			console.error(
				"ANVILKIT_PAGE_STORAGE=memory has nothing persistent to finalize. Pass --pages <dir>, --sqlite or --kv <file>.",
			);
			return 1;
		}
		stores.push(
			backend === "filesystem"
				? fileJsonStore(
						resolve(
							process.cwd(),
							process.env.ANVILKIT_PAGE_STORAGE_DIR ?? ".anvilkit/pages",
						),
					)
				: await sqliteJsonStore(),
		);
	}
	if (stores.length === 0) {
		console.error(
			"Select at least one surface: --all (the configured page store), --pages <dir>, --sqlite, or --kv <file>.\n" +
				"Snapshot surfaces are --kv: a JSON object mapping localStorage / Y.Map keys to their stored JSON strings.",
		);
		return 1;
	}

	if (values.write === true && (await devServerHoldsPort(3000))) {
		console.error(
			"REFUSED: the dev server is live on :3000 — writes are not frozen. Stop the server and re-run.",
		);
		return 1;
	}

	const runId = new Date().toISOString().replace(/[:.]/g, "-");
	const surfaces: SurfaceReport[] = [];
	for (const store of stores) {
		surfaces.push(
			await runSurface(
				store,
				values.write === true,
				(record) =>
					stampSchemaRevision(
						record as unknown as Parameters<typeof stampSchemaRevision>[0],
					) as unknown as Record<string, unknown>,
				STORE_SCHEMA_REVISION,
			),
		);
	}

	const sum = (pick: (surface: SurfaceReport) => number): number =>
		surfaces.reduce((total, surface) => total + pick(surface), 0);
	const report: RunReport = {
		runId,
		mode: values.write === true ? "write" : "dry-run",
		storeSchemaRevision: STORE_SCHEMA_REVISION,
		total: sum((surface) => surface.total),
		finalized: sum((surface) => surface.finalized),
		clean: sum((surface) => surface.clean),
		unparseable: sum((surface) => surface.unparseable),
		removed: surfaces.reduce(
			(total, surface) => addDocumentMarkers(total, surface.removed),
			NO_DOCUMENT_MARKERS,
		),
		surfaces,
	};

	console.log(formatRunSummary(report));
	if (values.report !== undefined) {
		const reportPath = resolve(values.report);
		await writeFile(reportPath, `${JSON.stringify(report, null, "\t")}\n`);
		console.log(`report written: ${reportPath}`);
	}
	// An unparseable address is the one thing a finalization run must not
	// pass silently: it is a value nobody migrated and nobody can rule out.
	return report.unparseable > 0 ? 1 : 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error) => {
		console.error("finalize-store crashed:", error);
		process.exitCode = 1;
	},
);
