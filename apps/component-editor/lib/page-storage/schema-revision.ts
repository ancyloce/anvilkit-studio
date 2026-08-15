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
 * - `record-ops.ts` is the only module that reads or writes a `EditorPageData`.
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
 * > following hold, and is removed by exactly one edit — making a below-floor
 * > classification *reject* rather than route through
 * > {@link migratePageRecordOnRead} — in the change that satisfies the third:
 * >
 * > 1. **MET (`p7-002`, 2026-08-11).** The store migration has shipped;
 * >    {@link STORE_SCHEMA_REVISION} is 2 and every record the runner touches
 * >    is written at it.
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
 *
 * > **Correction (`p7-002`).** As originally written the removal edit was
 * > "raising {@link STORE_SCHEMA_REVISION_FLOOR} to
 * > {@link STORE_SCHEMA_REVISION}". That is not what removes the branch — the
 * > floor decides *which* revisions are pre-finalization, and it has to move
 * > with every content-contract change or an unfinalized record reads as
 * > current. `p7-002` moved it 1 → 2 for exactly that reason and the branch is
 * > untouched. What actually retires the branch is turning a below-floor
 * > classification into a refusal, and the three conditions above gate that.
 */

import { finalizeStoredDocument } from "@anvilkit/core/editor";
import type { PageRecord, UnstampedPageRecord } from "./types";

/**
 * The revision the storage layer stamps on every record it writes.
 *
 * Bumped **only** by a store migration that changes what a stored record
 * means. Nothing else may move this number.
 *
 * | Revision | What it means | Landed in |
 * |---|---|---|
 * | 0 | unstamped — written before the store had a revision at all | pre-`p7-001` |
 * | 1 | stamped, but the document may still carry version markers | `p7-001` |
 * | 2 | **finalized**: no `authoringSchemaVersion`, no carrier `version`, no `__anvilkitInstance` | `p7-002` |
 */
export const STORE_SCHEMA_REVISION = 2;

/**
 * The lowest revision runtime code reads without routing through the migration
 * path. Records below it are recoverable, not corrupt.
 *
 * **Tracks {@link STORE_SCHEMA_REVISION}**, and `p7-002` moves it 1 → 2 for a
 * correctness reason, not a housekeeping one: a revision-1 record is stamped
 * but **not finalized** — it was written by a `p7-001` build and can still
 * carry all three version markers. Leaving the floor at 1 would classify it as
 * `"current"`, skip {@link migratePageRecordOnRead}, and hand the editor a
 * document the migration was supposed to have cleaned. The floor is what says
 * "runtime assumes this content contract"; the content contract changed here.
 *
 * This is a deliberate reading of the header policy, whose wording ("removed by
 * exactly one edit — raising the floor to the current revision") pictured the
 * floor lagging during the window. What that policy actually protects is the
 * below-floor **branch** — load-and-migrate rather than reject — and that
 * branch is untouched and is doing more work after this task, not less. Making
 * a below-floor record *fail* instead of load is a different edit, is the one
 * the three conditions gate, and has not been made.
 */
export const STORE_SCHEMA_REVISION_FLOOR = 2;

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
			`corrupt. Run \`pnpm --filter studio finalize:store --all --write\` ` +
			`to bring it to revision ${STORE_SCHEMA_REVISION}.`,
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
 * `p7-001` added the *marker and the routing* and left this an identity;
 * `p7-002` filled in the body. It strips the three version markers from both
 * payloads — `root.props.authoringSchemaVersion`, every carrier `version`, and
 * the legacy `__anvilkitInstance` prop — through the one pure pass that also
 * backs the store runner and the v1→v2 migration
 * (`@anvilkit/core`'s `finalizeStoredDocument`). One definition of "finalized",
 * three callers, so a document read on the fly and a document rewritten by the
 * runner cannot disagree.
 *
 * On-read migration is **in memory only**; nothing is written back here. A
 * record is promoted on its next real write (every adapter write path stamps
 * {@link STORE_SCHEMA_REVISION}), or wholesale by the store-finalization runner
 * (`apps/studio/scripts/finalize-store.ts`).
 *
 * **`schemaRevision` still carries the revision it was FOUND at**, never the
 * current one — deliberately, and unchanged from `p7-001`. The record's
 * *content* is finalized in memory; its *persisted* generation is not, and the
 * field describes the record on disk. Reporting `STORE_SCHEMA_REVISION` here
 * would tell a caller the store had been migrated when it had not, which is the
 * one thing the field exists to answer.
 *
 * Structural sharing is preserved: a below-floor record whose payloads happen to
 * be clean already comes back with the very same `draft`/`published`
 * references, so routing costs an object spread rather than a document clone.
 */
export function migratePageRecordOnRead(
	record: PageRecord,
	from: number,
): PageRecord {
	const draft = finalizeStoredDocument(record.draft);
	const published = finalizeStoredDocument(record.published);
	return {
		...record,
		...(draft.changed ? { draft: draft.value } : {}),
		...(published.changed ? { published: published.value } : {}),
		schemaRevision: from,
	};
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
