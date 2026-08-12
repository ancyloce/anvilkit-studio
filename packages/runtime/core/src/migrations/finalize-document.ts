/**
 * @file `p7-002` (PLAN-0026 §5, §4 R6) — the **store finalization**
 * pass: the pure function that makes the three surviving version
 * markers *absent* from a stored document rather than merely unwritten.
 *
 * ## What it removes, and why each one is a marker rather than data
 *
 * | Marker | Where it lived | Why it goes |
 * |---|---|---|
 * | `root.props.authoringSchemaVersion` | document root props | `p1-001` removed it from the contract. Nothing reads it since `p3-009` killed the command port, so it is pure vocabulary. |
 * | `version` on an `appearance` / `designSystem` / `componentLibrary` carrier | node props and root props | `p1-006` removed the literal from the schema. It survives only as an unknown key that `looseObject` preserves. |
 * | the `__anvilkitInstance` node prop | any node's props | `p3-003` renamed the write side to `anvilComponentInstance`. Stored documents keep the old spelling until this pass runs. |
 *
 * Nothing else is touched. In particular this pass does **not** remove
 * the legacy `__anvilkit` sidecar — that is a *conversion*, not a
 * marker strip, and it belongs to `migrateToPuckNativeV2`, which calls
 * this function as its last step.
 *
 * ## Why the walk is generic JSON rather than Puck-config-driven
 *
 * A document is stored in four shapes, and the markers are identical in
 * all four: a Puck `Data`, a `PageIR` version-history snapshot, a
 * delta-chain record holding an `IRDiff`, and a collab-persisted
 * payload. A `walkTree`-based pass would only reach the first. A
 * generic pass reaches all four with one implementation, which is what
 * makes "documents **and** snapshots" a single guarantee instead of two
 * that can drift.
 *
 * Two consequences the walk handles explicitly, because a naive
 * key-rename gets both wrong:
 *
 * 1. **`version` is only a marker in carrier position.** `PageIR.version`
 *    (the IR envelope), `PageIRNodeMeta.version`, `PageRecord.version`
 *    (the author-facing product version) and the legacy sidecar's own
 *    `version` are all legitimate and all left alone. Only a `version`
 *    key whose parent was reached through {@link CARRIER_KEYS} is
 *    removed.
 * 2. **A marker can appear as a value, not only as a key.** A
 *    version-history delta record stores
 *    `{ kind: "change-prop", key: "__anvilkitInstance", before, after }`
 *    — the prop name is *data* there. That single shape is special-cased
 *    (and its `before`/`after` inherit carrier position from its `key`),
 *    because leaving it would let a restore replay the legacy spelling
 *    back onto a finalized document, which is precisely how a completed
 *    migration comes back.
 *
 * ## Idempotence
 *
 * The pass returns the **same object reference** when it changes
 * nothing, at every level of the tree. So `finalizeStoredDocument` twice
 * is not merely equal but identical, and `changed === false` on the
 * second run is a structural fact rather than a deep comparison.
 *
 * ## External artifacts are OUT OF CONTRACT
 *
 * PLAN-0026 §5 declares this explicitly and it is repeated here because
 * this is the function that draws the line:
 *
 * > A document that is not in the store when the migration runs is not
 * > migrated by it. Downloaded exports, off-store backups, files a user
 * > saved to disk, snapshots held in a browser's `localStorage` on a
 * > machine that never opens the app again, and any copy taken before
 * > the run are **out of contract**. They are not corrupted — they are
 * > simply pre-finalization documents, and after `p7-004` no runtime
 * > code reads that form.
 *
 * Out of contract is not out of reach: `p7-004` tags a recovery release
 * carrying the migration CLI, and that release remains the supported
 * way to bring a stray artifact forward. What is *not* supported is
 * loading one directly into a finalized runtime. `apps/studio`'s store
 * loader states the same boundary from the read side
 * (`lib/page-storage/schema-revision.ts`, below-floor policy).
 *
 * ## Lifetime
 *
 * `p7-004` deletes `./puck-native-v2.ts` and `./legacy-sidecar.ts`.
 * **This module survives that deletion**: it is the body of
 * `migratePageRecordOnRead`, which `p7-001`'s below-floor policy keeps
 * alive for at least two further finalized revisions so a restore from
 * a backup still loads.
 */

/**
 * Node- and root-prop carriers whose `version` key is a marker.
 *
 * Deliberately a closed list rather than "strip `version` everywhere":
 * see consequence 1 in the file doc. Adding an entry here changes what
 * counts as a marker, so it is a contract decision, not a tweak.
 */
const CARRIER_KEYS: ReadonlySet<string> = new Set([
	"appearance",
	"designSystem",
	"componentLibrary",
]);

/** The removed root-props marker (`p1-001`). */
const AUTHORING_SCHEMA_VERSION_KEY = "authoringSchemaVersion";

/** The pre-`p3-003` spelling of the component-instance link. */
const LEGACY_INSTANCE_PROP = "__anvilkitInstance";

/** The canonical spelling every writer has emitted since `p3-003`. */
const CANONICAL_INSTANCE_PROP = "anvilComponentInstance";

/**
 * The one diff shape that carries a prop *name* as a value. See
 * consequence 2 in the file doc.
 */
const PROP_CHANGE_KIND = "change-prop";

/** How many of each marker a document carries (or a pass removed). */
export interface DocumentMarkerCounts {
	/** `root.props.authoringSchemaVersion` occurrences. */
	readonly authoringSchemaVersion: number;
	/** `version` keys on an appearance/designSystem/componentLibrary carrier. */
	readonly appearanceVersion: number;
	/** `__anvilkitInstance` occurrences, as a prop key or as a diff `key` value. */
	readonly legacyInstanceProp: number;
}

/** A document with no markers left. */
export const NO_DOCUMENT_MARKERS: DocumentMarkerCounts = Object.freeze({
	authoringSchemaVersion: 0,
	appearanceVersion: 0,
	legacyInstanceProp: 0,
});

/** Total across all three markers — the number acceptance is stated in. */
export function totalDocumentMarkers(counts: DocumentMarkerCounts): number {
	return (
		counts.authoringSchemaVersion +
		counts.appearanceVersion +
		counts.legacyInstanceProp
	);
}

/** Sum two marker tallies (folding a per-surface scan into a run total). */
export function addDocumentMarkers(
	left: DocumentMarkerCounts,
	right: DocumentMarkerCounts,
): DocumentMarkerCounts {
	return {
		authoringSchemaVersion:
			left.authoringSchemaVersion + right.authoringSchemaVersion,
		appearanceVersion: left.appearanceVersion + right.appearanceVersion,
		legacyInstanceProp: left.legacyInstanceProp + right.legacyInstanceProp,
	};
}

/** What {@link finalizeStoredDocument} produced. */
export interface FinalizeStoredDocumentResult<T> {
	/**
	 * The finalized value. **Identical by reference** to the input when
	 * `changed` is `false`, so idempotence is checkable with `===`.
	 */
	readonly value: T;
	/** Did anything move? `false` means the input was already final. */
	readonly changed: boolean;
	/** What was removed or renamed, by marker. */
	readonly removed: DocumentMarkerCounts;
}

/** Mutable tally threaded through the walk. */
interface Tally {
	authoringSchemaVersion: number;
	appearanceVersion: number;
	legacyInstanceProp: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walk one value.
 *
 * `inCarrier` says whether *this* value is a carrier object — i.e. it
 * was reached through a {@link CARRIER_KEYS} key — which is the only
 * position where `version` is a marker.
 *
 * Returns the input reference unchanged when nothing moved.
 */
function finalizeValue(
	value: unknown,
	inCarrier: boolean,
	tally: Tally,
): unknown {
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((entry) => {
			const result = finalizeValue(entry, false, tally);
			if (result !== entry) changed = true;
			return result;
		});
		return changed ? next : value;
	}
	if (!isPlainObject(value)) return value;

	// The delta-record special case: this object names a prop rather
	// than holding one, so the marker is in `key`'s VALUE.
	const propChangeKey =
		value.kind === PROP_CHANGE_KIND && typeof value.key === "string"
			? value.key
			: undefined;

	const hasCanonicalInstance = value[CANONICAL_INSTANCE_PROP] !== undefined;
	let changed = false;
	const next: Record<string, unknown> = {};

	for (const [key, entry] of Object.entries(value)) {
		if (key === AUTHORING_SCHEMA_VERSION_KEY) {
			tally.authoringSchemaVersion += 1;
			changed = true;
			continue;
		}
		if (inCarrier && key === "version") {
			tally.appearanceVersion += 1;
			changed = true;
			continue;
		}
		if (key === LEGACY_INSTANCE_PROP) {
			tally.legacyInstanceProp += 1;
			changed = true;
			// Canonical wins: a node mid-migration carrying both spellings
			// loses the legacy one rather than having it overwrite the key
			// every writer has emitted since `p3-003`.
			if (hasCanonicalInstance) continue;
			next[CANONICAL_INSTANCE_PROP] = finalizeValue(entry, false, tally);
			continue;
		}
		if (key === "key" && propChangeKey === LEGACY_INSTANCE_PROP) {
			tally.legacyInstanceProp += 1;
			changed = true;
			next.key = CANONICAL_INSTANCE_PROP;
			continue;
		}
		// `before`/`after` of a `change-prop` op hold the value of the prop
		// its `key` names, so they inherit that key's carrier position.
		const childInCarrier =
			CARRIER_KEYS.has(key) ||
			(propChangeKey !== undefined &&
				(key === "before" || key === "after") &&
				CARRIER_KEYS.has(propChangeKey));
		const result = finalizeValue(entry, childInCarrier, tally);
		if (result !== entry) changed = true;
		next[key] = result;
	}

	return changed ? next : value;
}

/**
 * Strip every version marker from one stored value — a Puck `Data`, a
 * `PageIR` snapshot, a delta-chain record, a collab payload, or any
 * JSON containing one of those.
 *
 * Pure and total: no I/O, no clock, no throw. An input carrying no
 * markers comes back by reference with `changed: false`.
 */
export function finalizeStoredDocument<T>(
	value: T,
): FinalizeStoredDocumentResult<T> {
	const tally: Tally = {
		authoringSchemaVersion: 0,
		appearanceVersion: 0,
		legacyInstanceProp: 0,
	};
	const next = finalizeValue(value, false, tally) as T;
	return {
		value: next,
		changed: next !== value,
		removed: {
			authoringSchemaVersion: tally.authoringSchemaVersion,
			appearanceVersion: tally.appearanceVersion,
			legacyInstanceProp: tally.legacyInstanceProp,
		},
	};
}

/**
 * Count the markers in a stored value without changing it — the scan
 * `p7-003`'s dry run and `p7-004`'s post-run acceptance are stated in.
 *
 * Defined in terms of {@link finalizeStoredDocument} on purpose: a
 * separate counting walk is a second definition of "a marker", and the
 * two would eventually disagree about exactly the edge cases the file
 * doc spends its length on.
 */
export function countDocumentMarkers(value: unknown): DocumentMarkerCounts {
	return finalizeStoredDocument(value).removed;
}
