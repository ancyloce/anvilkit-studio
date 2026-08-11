/**
 * @file `p7-001` (`ED-FA-018`, ADR 0007 decision 2) — the store's schema
 * revision: the field itself, the writer that stamps it, the floor, and the
 * three-way loader that reads it.
 *
 * ## Why the field lives here and nowhere else
 *
 * PLAN-0026 §5 bans version vocabulary **in the document**. It says nothing
 * about the **store**, and the two are different things: a document is what
 * Puck's `Data` contract describes and what four consumers render; a record is
 * what persistence wraps around it. `schemaRevision` describes which migration
 * generation a *record* belongs to — the same category of fact as `createdAt`.
 *
 * The separation is enforced by the compiler, not by this comment:
 *
 * - `record-ops.ts` is the only module that reads or writes a `DemoPageData`.
 *   Every one of its builders returns {@link UnstampedPageRecord}, so a
 *   returned object literal naming `schemaRevision` is a **type error**. The
 *   module that touches documents therefore cannot express the field at all.
 * - {@link stampSchemaRevision} is the only function that produces a
 *   `PageRecord` from an `UnstampedPageRecord`, and it writes the field at the
 *   **record** root. It never touches `record.draft` or `record.published`.
 * - The loader reads the revision from the record root only
 *   ({@link revisionOf}). A `schemaRevision` key that somehow appeared inside a
 *   document's `root.props` would be inert unknown data that nothing in this
 *   pipeline reads.
 *
 * ## The three cases the loader distinguishes
 *
 * Before this task the store had two: a record parsed, or it did not. A
 * pre-finalization record — one written before the `p7-002` migration — parsed
 * fine and then failed *later*, in the editor, as a generic "unsupported
 * document format". That collapse is what this module fixes.
 *
 * 1. **at the floor or above** → `"current"`. Load it.
 * 2. **below the floor** (including a record with no `schemaRevision` at all,
 *    which is *every* record written before this task) → `"below-floor"`.
 *    Routed through {@link migratePageRecordOnRead} with a diagnostic naming
 *    the record, the revision found and the floor. **Not an error.** The record
 *    still loads.
 * 3. **unreadable** — not JSON, or JSON that is not a page record →
 *    `"corrupt"`. Reported distinctly, with a message that carries no version
 *    vocabulary (`p7-004`'s acceptance criterion).
 *
 * ## Below-floor support policy — read this before deleting the branch
 *
 * The below-floor read path is **not** a temporary scaffold to be removed at
 * the next cleanup pass. It is the recovery mechanism ADR 0007 decision 2
 * bought, and its lifetime is stated so it reads as a decision:
 *
 * > **Policy.** The below-floor path stays alive until *all three* of the
 * > following hold, and is removed by exactly one edit — raising
 * > {@link STORE_SCHEMA_REVISION_FLOOR} to {@link STORE_SCHEMA_REVISION} — in
 * > the change that satisfies the third:
 * >
 * > 1. `p7-002`'s store migration has shipped and bumped every record it
 * >    touched to the revision it finalizes.
 * > 2. `p7-003`'s dry run on a store copy reports **zero** documents and
 * >    **zero** version-history snapshots below the new revision, and
 * >    `p7-004`'s post-run production scan reports the same against the real
 * >    store — captured as output, not asserted.
 * > 3. **Two further finalized revisions** have shipped after the one being
 * >    retired. A record can be older than the last migration by exactly one
 * >    restore from a backup or an off-store export, and two revisions is the
 * >    window in which that restore is still expected to be attempted.
 * >
 * > **Named removal trigger:** `p7-004` step 4 (banned-identifier prune). That
 * > is the task that already inspects this loader's error path, already has the
 * > production scan output in hand, and is the last point in the program where
 * > deleting the branch is cheap. If condition 3 is unmet when `p7-004` runs —
 * > which it will be, since `p7-004` ships the *first* finalized revision — the
 * > branch stays and this policy is re-evaluated two revisions later. Removing
 * > it earlier turns every unmigrated record back into a corrupt one, which is
 * > the exact failure this module exists to prevent.
 */

import type { PageRecord, UnstampedPageRecord } from "./types";

/**
 * The revision the storage layer stamps on every record it writes.
 *
 * Bumped **only** by a store migration that changes what a stored record
 * means. `p7-002` is the next bump; nothing else may move this number.
 */
export const STORE_SCHEMA_REVISION = 1;

/**
 * The lowest revision runtime code reads without routing through the migration
 * path. Records below it are recoverable, not corrupt.
 *
 * Held at `1` deliberately: it is the *stamped* revision, so a record carrying
 * no `schemaRevision` — every record written before `p7-001` — reads as
 * {@link PRE_STAMP_REVISION} and lands in the below-floor branch. Raising this
 * is governed by the policy in this file's header.
 */
export const STORE_SCHEMA_REVISION_FLOOR = 1;

/**
 * The revision attributed to a record with no `schemaRevision` field. Not a
 * value any writer emits — it is what "written before the store had a
 * revision" reads as, which is why it sits strictly below the floor.
 */
export const PRE_STAMP_REVISION = 0;

/** A stored record that could not be read as a page record at all. */
export class CorruptPageRecordError extends Error {
	readonly source: string;

	constructor(diagnostic: string, source: string, options?: ErrorOptions) {
		super(diagnostic, options);
		this.name = "CorruptPageRecordError";
		this.source = source;
	}
}

/** The three — and only three — outcomes of reading a stored value. */
export type StoredRecordLoad =
	| { readonly kind: "current"; readonly record: PageRecord }
	| {
			readonly kind: "below-floor";
			readonly record: PageRecord;
			readonly revision: number;
			readonly diagnostic: string;
	  }
	| {
			readonly kind: "corrupt";
			readonly diagnostic: string;
			readonly source: string;
			readonly cause?: unknown;
	  };

/**
 * Stamp a freshly built record with the current revision. **The only writer of
 * `schemaRevision` in the app.** Every adapter write path funnels through it,
 * and `record-ops.ts` cannot bypass it because its builders are typed to return
 * an {@link UnstampedPageRecord}.
 *
 * The spread order matters: an inbound `schemaRevision` carried over from an
 * `existing` record is overwritten, so re-saving a below-floor record promotes
 * it rather than preserving a stale revision.
 */
export function stampSchemaRevision(draft: UnstampedPageRecord): PageRecord {
	return { ...draft, schemaRevision: STORE_SCHEMA_REVISION };
}

/** The revision a stored value declares, or {@link PRE_STAMP_REVISION}. */
function revisionOf(value: Record<string, unknown>): number {
	const declared = value.schemaRevision;
	return typeof declared === "number" && Number.isFinite(declared)
		? declared
		: PRE_STAMP_REVISION;
}

/**
 * Is this a page record at all? Deliberately checks only the fields a record
 * has carried since before `schemaRevision` existed — `schemaRevision` itself
 * must **never** appear here, or every pre-`p7-001` record would classify as
 * corrupt and the whole store would read as unrecoverable.
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

/**
 * Classify an already-parsed stored value. Pure: it reports, routes nothing and
 * logs nothing.
 *
 * `source` names where the value came from (a file path, a table row id) and
 * appears in both diagnostics — a corrupt record is worthless without knowing
 * which one it is.
 */
export function classifyStoredRecord(
	value: unknown,
	source: string,
): StoredRecordLoad {
	if (!isPageRecordShape(value)) {
		return {
			kind: "corrupt",
			source,
			// Deliberately generic and vocabulary-free (`p7-004`): a value that is
			// not a record cannot be described in terms of what generation it is.
			diagnostic: `Unsupported document format: ${source} is not a readable page record.`,
		};
	}
	const revision = revisionOf(value);
	const record = value as unknown as PageRecord;
	if (revision >= STORE_SCHEMA_REVISION_FLOOR) {
		return { kind: "current", record };
	}
	return {
		kind: "below-floor",
		record,
		revision,
		diagnostic:
			`Page record "${record.id}" (${source}) is at store schema revision ` +
			`${revision}${revision === PRE_STAMP_REVISION ? " (unstamped)" : ""}, ` +
			`below the supported floor ${STORE_SCHEMA_REVISION_FLOOR}. It was ` +
			`routed through the store migration path and loaded — it is not ` +
			`corrupt. Run the store migration to bring it to revision ` +
			`${STORE_SCHEMA_REVISION}.`,
	};
}

/** Classify a stored JSON payload, folding a parse failure into `"corrupt"`. */
export function classifyStoredRecordJson(
	raw: string,
	source: string,
): StoredRecordLoad {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			kind: "corrupt",
			source,
			cause: error,
			diagnostic: `Unsupported document format: ${source} is not readable JSON.`,
		};
	}
	return classifyStoredRecord(parsed, source);
}

/**
 * The store migration path a below-floor record is routed through on read.
 *
 * Today it is an identity: `p7-001` adds the *marker and the routing*, and
 * `p7-002` adds the migration that has something to do — strip
 * `authoringSchemaVersion`, strip `appearance.version`, rename the instance
 * prop — and bumps {@link STORE_SCHEMA_REVISION}. Keeping the seam named and
 * called from day one is what makes `p7-002` a body change rather than a
 * re-plumbing, and it is why a below-floor record loads at all instead of
 * failing the way it did before this task.
 *
 * On-read migration is **in memory only**; nothing is written back here. A
 * record is promoted on its next real write (every adapter write path stamps),
 * or wholesale by `p7-002`'s runner.
 *
 * The one thing it does today is make the returned record's type honest: a
 * below-floor record has no `schemaRevision` on disk, and handing a caller a
 * `PageRecord` whose required field is `undefined` at runtime is exactly the
 * kind of quiet lie that makes the next reader distrust the type. It carries
 * the revision it was **found** at, never the current one — a caller can still
 * tell an unmigrated record from a migrated one.
 */
export function migratePageRecordOnRead(
	record: PageRecord,
	from: number,
): PageRecord {
	return { ...record, schemaRevision: from };
}

/** Diagnostics already emitted, so a `list()` over N stale records warns N times, not N×reads. */
const reported = new Set<string>();

function reportBelowFloor(
	load: Extract<StoredRecordLoad, { kind: "below-floor" }>,
): void {
	const key = `${load.record.id}@${load.revision}`;
	if (reported.has(key)) return;
	reported.add(key);
	console.warn(`[page-storage] ${load.diagnostic}`);
}

/** Test seam: forget which below-floor diagnostics have already been emitted. */
export function resetSchemaRevisionDiagnostics(): void {
	reported.clear();
}

/** Shared tail of both routing helpers: report once, then route. */
function routeBelowFloor(
	load: Extract<StoredRecordLoad, { kind: "below-floor" }>,
): PageRecord {
	reportBelowFloor(load);
	return migratePageRecordOnRead(load.record, load.revision);
}

/**
 * Route a classification for a **single addressed read** (`getById`,
 * `getBySlug`): a corrupt record is the answer to the question that was asked,
 * so it throws {@link CorruptPageRecordError} rather than reading as "missing"
 * — a caller must never mistake data loss for a 404.
 */
export function requireStoredRecord(load: StoredRecordLoad): PageRecord {
	if (load.kind === "corrupt") {
		throw new CorruptPageRecordError(load.diagnostic, load.source, {
			cause: load.cause,
		});
	}
	return load.kind === "below-floor" ? routeBelowFloor(load) : load.record;
}

/**
 * Route a classification during a **scan** (`list`, `readAll`): one corrupt
 * record must not take down the whole listing, so it is skipped — but reported,
 * never silently dropped, which is what the pre-`p7-001` `catch {}` did.
 */
export function tolerateStoredRecord(
	load: StoredRecordLoad,
): PageRecord | null {
	if (load.kind === "corrupt") {
		console.warn(`[page-storage] ${load.diagnostic} Skipped.`);
		return null;
	}
	return load.kind === "below-floor" ? routeBelowFloor(load) : load.record;
}
