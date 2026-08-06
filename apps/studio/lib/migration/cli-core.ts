/**
 * @file P5-02 — the migration CLI's testable core (PLAN-0025 §10.3).
 *
 * `scripts/migrate-puck-native-v2.ts` is a thin arg-parsing entry;
 * everything §10.3 requires lives here, storage- and clock-injected
 * so the §14.5 backup/restore drill runs in vitest against the
 * memory adapter:
 *
 * - dry-run is the DEFAULT (`write: false` analyzes and reports);
 * - selection by record id, slug, or `--all`;
 * - bounded concurrency;
 * - per-payload old hash, new hash, and compiled-CSS hash;
 * - failed records write NOTHING (per-record all-or-nothing across
 *   draft + published payloads);
 * - idempotent re-runs report `already-v2`;
 * - an immutable old-record snapshot is persisted BEFORE every write,
 *   and the run report doubles as the §10.4 backup manifest;
 * - CAS: the record is re-read immediately before writing and skipped
 *   as `cas-conflict` when `updatedAt` moved (the adapter has no
 *   native compare-and-swap; recorded);
 * - `restoreFromManifest` is the §10.5 rollback path.
 *
 * Write-order subtlety (adapter semantics, verified in
 * `record-ops.ts`): `publish()` sets BOTH `draft` and `published` to
 * the same data, so a divergent draft is restored with a follow-up
 * `saveDraft()`. Archived records are never written — they are the
 * exit gate's "explicitly isolated" arm and stay legacy until
 * un-archived and re-migrated.
 */

import { createHash } from "node:crypto";
import {
	compileDocumentAppearance,
	type MigrationDiagnostic,
	migrateToPuckNativeV2,
} from "@anvilkit/core/editor";
import type { Config, Data } from "@puckeditor/core";
import type {
	DemoPageData,
	PageRecord,
	PageStorageAdapter,
} from "../page-storage/types";

export interface SnapshotStore {
	/** Persist one immutable snapshot; returns its address/path. */
	write(name: string, content: string): Promise<string>;
	/** Read a snapshot back by the address `write` returned. */
	read(address: string): Promise<string>;
}

export interface MigrationCliDeps {
	readonly storage: PageStorageAdapter;
	readonly config: Config;
	readonly snapshots: SnapshotStore;
	/** Injected clock (run ids, CAS reporting); never called in dry-run analysis. */
	readonly nowIso: () => string;
	readonly defaultTokenMode?: string;
}

export interface MigrationSelection {
	readonly all?: boolean;
	readonly id?: string;
	readonly slug?: string;
}

export interface MigrateStoreOptions {
	readonly write: boolean;
	readonly selection: MigrationSelection;
	readonly concurrency?: number;
}

export interface PayloadOutcome {
	readonly status: "migrated" | "already-v2" | "blocked";
	readonly oldHash: string;
	readonly newHash?: string;
	readonly cssHash?: string;
	readonly fingerprint?: string;
	readonly diagnostics: readonly MigrationDiagnostic[];
}

export interface RecordOutcome {
	readonly id: string;
	readonly slug: string;
	readonly status:
		| "migrated"
		| "already-v2"
		| "blocked"
		| "cas-conflict"
		| "skipped-archived"
		| "written";
	readonly payloads: {
		readonly draft?: PayloadOutcome;
		readonly published?: PayloadOutcome;
	};
	readonly snapshot?: string;
}

/** The machine-readable run report — doubles as the backup manifest. */
export interface MigrationRunReport {
	readonly runId: string;
	readonly mode: "dry-run" | "write";
	readonly total: number;
	readonly written: number;
	readonly migratable: number;
	readonly alreadyV2: number;
	readonly blocked: number;
	readonly casConflicts: number;
	readonly skippedArchived: number;
	/** §10.4 step 2: this must reach zero before cutover. */
	readonly errorCount: number;
	readonly records: readonly RecordOutcome[];
}

export function hashPayload(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function analyzePayload(
	payload: DemoPageData,
	deps: MigrationCliDeps,
): PayloadOutcome {
	const oldHash = hashPayload(payload);
	const result = migrateToPuckNativeV2(
		payload as unknown as Data,
		deps.config,
		{
			...(deps.defaultTokenMode !== undefined
				? { defaultTokenMode: deps.defaultTokenMode }
				: {}),
		},
	);
	if (result.status === "blocked") {
		return { status: "blocked", oldHash, diagnostics: result.diagnostics };
	}
	if (result.status === "already-v2") {
		return { status: "already-v2", oldHash, diagnostics: result.diagnostics };
	}
	const compiled = compileDocumentAppearance({
		data: result.data as Data,
		config: deps.config,
	});
	return {
		status: "migrated",
		oldHash,
		newHash: hashPayload(result.data),
		cssHash: createHash("sha256").update(compiled.css).digest("hex"),
		fingerprint: compiled.fingerprint,
		diagnostics: result.diagnostics,
	};
}

function migratedData(
	payload: DemoPageData,
	deps: MigrationCliDeps,
): DemoPageData {
	const result = migrateToPuckNativeV2(
		payload as unknown as Data,
		deps.config,
		{
			...(deps.defaultTokenMode !== undefined
				? { defaultTokenMode: deps.defaultTokenMode }
				: {}),
		},
	);
	if (result.status !== "migrated" || result.data === undefined) {
		throw new Error("migratedData called for a non-migratable payload");
	}
	return result.data as unknown as DemoPageData;
}

async function selectRecords(
	deps: MigrationCliDeps,
	selection: MigrationSelection,
): Promise<PageRecord[]> {
	if (selection.id !== undefined) {
		const record = await deps.storage.getById(selection.id);
		return record === null ? [] : [record];
	}
	if (selection.slug !== undefined) {
		const record = await deps.storage.getBySlug(selection.slug);
		return record === null ? [] : [record];
	}
	return deps.storage.list();
}

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, items.length)) },
		async () => {
			while (next < items.length) {
				const index = next;
				next += 1;
				results[index] = await fn(items[index] as T);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

/** Analyze (and with `write: true`, migrate) the selected records. */
export async function migrateStore(
	deps: MigrationCliDeps,
	options: MigrateStoreOptions,
): Promise<MigrationRunReport> {
	const runId = deps.nowIso().replace(/[:.]/g, "-");
	const records = await selectRecords(deps, options.selection);

	const outcomes = await mapWithConcurrency(
		records,
		options.concurrency ?? 4,
		async (record): Promise<RecordOutcome> => {
			if (record.status === "archived") {
				return {
					id: record.id,
					slug: record.slug,
					status: "skipped-archived",
					payloads: {},
				};
			}
			const draft =
				record.draft === undefined
					? undefined
					: analyzePayload(record.draft, deps);
			const published =
				record.published === undefined
					? undefined
					: analyzePayload(record.published, deps);
			const payloads = {
				...(draft !== undefined ? { draft } : {}),
				...(published !== undefined ? { published } : {}),
			};
			const all = [draft, published].filter(
				(payload): payload is PayloadOutcome => payload !== undefined,
			);
			if (all.some((payload) => payload.status === "blocked")) {
				// Per-record all-or-nothing: one blocked payload blocks the
				// record; nothing is written (§10.1).
				return {
					id: record.id,
					slug: record.slug,
					status: "blocked",
					payloads,
				};
			}
			if (all.every((payload) => payload.status === "already-v2")) {
				return {
					id: record.id,
					slug: record.slug,
					status: "already-v2",
					payloads,
				};
			}
			if (!options.write) {
				return {
					id: record.id,
					slug: record.slug,
					status: "migrated",
					payloads,
				};
			}

			// §10.3: immutable old-record snapshot BEFORE any write.
			const snapshot = await deps.snapshots.write(
				`${runId}/${record.id}.json`,
				JSON.stringify(record, null, "\t"),
			);

			// CAS: re-read and compare updatedAt right before writing.
			const current = await deps.storage.getById(record.id);
			if (current === null || current.updatedAt !== record.updatedAt) {
				return {
					id: record.id,
					slug: record.slug,
					status: "cas-conflict",
					payloads,
					snapshot,
				};
			}

			// publish() sets draft AND published to the same data — so
			// after publishing, ANY divergent original draft (migrated OR
			// already-v2) must be re-applied, or it would be silently
			// clobbered by the published payload.
			const publishedWritten = published?.status === "migrated";
			if (publishedWritten) {
				await deps.storage.publish({
					id: record.id,
					slug: record.slug,
					data: migratedData(record.published as DemoPageData, deps),
				});
			}
			if (record.draft !== undefined && draft !== undefined) {
				const draftDiverges =
					record.published === undefined ||
					hashPayload(record.draft) !== hashPayload(record.published);
				const draftValue =
					draft.status === "migrated"
						? migratedData(record.draft, deps)
						: record.draft; // already-v2 draft, byte-preserved
				const needsWrite = publishedWritten
					? draftDiverges
					: draft.status === "migrated";
				if (needsWrite) {
					await deps.storage.saveDraft({
						id: record.id,
						slug: record.slug,
						data: draftValue,
					});
				}
			}
			return {
				id: record.id,
				slug: record.slug,
				status: "written",
				payloads,
				snapshot,
			};
		},
	);

	const count = (status: RecordOutcome["status"]): number =>
		outcomes.filter((outcome) => outcome.status === status).length;
	const blocked = count("blocked");
	const casConflicts = count("cas-conflict");
	return {
		runId,
		mode: options.write ? "write" : "dry-run",
		total: outcomes.length,
		written: count("written"),
		migratable: count("migrated") + count("written"),
		alreadyV2: count("already-v2"),
		blocked,
		casConflicts,
		skippedArchived: count("skipped-archived"),
		errorCount: blocked + casConflicts,
		records: outcomes,
	};
}

/** §10.5 rollback: restore snapshotted records from a run manifest. */
export async function restoreFromManifest(
	deps: Pick<MigrationCliDeps, "storage" | "snapshots">,
	manifest: MigrationRunReport,
): Promise<{ restored: number; missing: number }> {
	let restored = 0;
	let missing = 0;
	for (const outcome of manifest.records) {
		if (outcome.snapshot === undefined) continue;
		let original: PageRecord;
		try {
			original = JSON.parse(
				await deps.snapshots.read(outcome.snapshot),
			) as PageRecord;
		} catch {
			missing += 1;
			continue;
		}
		if (original.published !== undefined) {
			await deps.storage.publish({
				id: original.id,
				slug: original.slug,
				data: original.published,
			});
		}
		if (original.draft !== undefined) {
			await deps.storage.saveDraft({
				id: original.id,
				slug: original.slug,
				data: original.draft,
			});
		}
		restored += 1;
	}
	return { restored, missing };
}

/** One-line-per-record human summary (the CLI prints this). */
export function formatRunSummary(report: MigrationRunReport): string {
	const lines = [
		`migrate-puck-native-v2 ${report.mode} — run ${report.runId}`,
		`records: ${report.total} · written: ${report.written} · migratable: ${report.migratable} · already-v2: ${report.alreadyV2} · blocked: ${report.blocked} · cas-conflicts: ${report.casConflicts} · archived-skipped: ${report.skippedArchived}`,
		`error count (must be zero before cutover): ${report.errorCount}`,
	];
	for (const record of report.records) {
		const details = Object.entries(record.payloads)
			.map(([kind, payload]) => `${kind}:${payload.status}`)
			.join(" ");
		lines.push(
			`  - ${record.slug} (${record.id}): ${record.status}${details === "" ? "" : ` [${details}]`}`,
		);
		for (const [, payload] of Object.entries(record.payloads)) {
			for (const diagnostic of payload.diagnostics) {
				if (diagnostic.severity === "info") continue;
				lines.push(
					`      ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`,
				);
			}
		}
	}
	return lines.join("\n");
}
