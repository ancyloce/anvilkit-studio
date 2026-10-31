/**
 * Schema mirror of the page component lock (AnvilKit DD-05 §2, P20), the
 * host-defined root prop `root.props.remoteComponentLock` that pins every
 * remote component a page uses to one exact release.
 *
 * Mirrors `contracts/components/component.schema.json#/$defs/pageComponentLock`
 * of the platform repository field for field: a `schemaVersion` of 1 and at
 * most 200 entries, each a `remoteComponentLock` carrying its own
 * `schemaVersion` of 1, `componentId`, `puckType` (`^[A-Z][A-Za-z0-9]{0,63}$`,
 * immutable), `releaseId`, `packageName`, `packageVersion` (exact semver),
 * `browserManifestDigest` (`sha256:` hex) and `hostProfileId`, sorted by
 * `puckType` with no duplicate type. It is a sibling of
 * `root.props.componentLibrary` (the document-local reusable definitions)
 * and never lives inside it; Puck attaches no meaning to either key.
 *
 * Reading is deliberately three-valued. A value that fails this mirror —
 * including a lock written in the earlier S1 shape (`releaseManifestDigest`,
 * no `packageName`) — is classified as `unreadable` and the page writer
 * preserves its exact bytes (`record-ops.ts`) rather than replacing them, so
 * a page whose lock this build cannot parse is still saveable and never
 * silently loses or upgrades the lock. Its nodes load as placeholders; no
 * release is guessed for them.
 */
export interface RemoteComponentLockEntry {
	readonly schemaVersion: 1;
	readonly componentId: string;
	readonly puckType: string;
	readonly releaseId: string;
	readonly packageName: string;
	readonly packageVersion: string;
	readonly browserManifestDigest: string;
	readonly hostProfileId: string;
}

export interface PageComponentLock {
	readonly schemaVersion: 1;
	readonly entries: readonly RemoteComponentLockEntry[];
}

export type RemoteComponentLockRead =
	| { readonly state: "absent" }
	| { readonly state: "valid"; readonly lock: PageComponentLock }
	| {
			readonly state: "unreadable";
			readonly raw: unknown;
			readonly reason: string;
	  };

export const REMOTE_COMPONENT_LOCK_KEY = "remoteComponentLock";
export const MAX_LOCK_ENTRIES = 200;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUCK_TYPE = /^[A-Z][A-Za-z0-9]{0,63}$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SEMVER =
	/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;
const ENTRY_KEYS = [
	"schemaVersion",
	"componentId",
	"puckType",
	"releaseId",
	"packageName",
	"packageVersion",
	"browserManifestDigest",
	"hostProfileId",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
	value: unknown,
	maxLength: number,
	pattern: RegExp,
): value is string {
	return (
		typeof value === "string" &&
		value.length >= 1 &&
		value.length <= maxLength &&
		pattern.test(value)
	);
}

/** The first violation of one entry, or `null` when it is a valid lock entry. */
export function describeLockEntryViolation(
	entry: unknown,
	at = "entry",
): string | null {
	if (!isRecord(entry)) return `${at} is not an object`;
	if (
		Object.keys(entry).some(
			(k) => !(ENTRY_KEYS as readonly string[]).includes(k),
		)
	) {
		return `${at} carries an unknown key`;
	}
	if (entry.schemaVersion !== 1) return `${at}.schemaVersion is not 1`;
	if (!boundedString(entry.componentId, 128, ID)) return `${at}.componentId`;
	if (!boundedString(entry.puckType, 64, PUCK_TYPE)) return `${at}.puckType`;
	if (!boundedString(entry.releaseId, 128, ID)) return `${at}.releaseId`;
	if (!boundedString(entry.packageName, 214, PACKAGE_NAME)) {
		return `${at}.packageName`;
	}
	if (!boundedString(entry.packageVersion, 128, SEMVER)) {
		return `${at}.packageVersion is not an exact semver`;
	}
	if (!boundedString(entry.browserManifestDigest, 71, DIGEST)) {
		return `${at}.browserManifestDigest is not a sha256 digest`;
	}
	if (!boundedString(entry.hostProfileId, 128, ID)) {
		return `${at}.hostProfileId`;
	}
	return null;
}

/** The first violation of the mirror, or `null` when `value` is a valid lock. */
export function describeRemoteComponentLockViolation(
	value: unknown,
): string | null {
	if (!isRecord(value)) return "lock is not an object";
	const keys = Object.keys(value);
	if (keys.some((k) => k !== "schemaVersion" && k !== "entries")) {
		return "lock carries an unknown key";
	}
	if (value.schemaVersion !== 1) return "schemaVersion is not 1";
	if (!Array.isArray(value.entries)) return "entries is not an array";
	if (value.entries.length > MAX_LOCK_ENTRIES) {
		return `entries exceeds ${MAX_LOCK_ENTRIES}`;
	}
	let previousType: string | null = null;
	for (const [index, entry] of value.entries.entries()) {
		const at = `entries[${index}]`;
		const violation = describeLockEntryViolation(entry, at);
		if (violation !== null) return violation;
		const type = (entry as RemoteComponentLockEntry).puckType;
		if (previousType !== null && type <= previousType) {
			return `${at}.puckType is not sorted after "${previousType}" or repeats it`;
		}
		previousType = type;
	}
	return null;
}

/** Classify the lock carried by a page document's `root.props`. */
export function readRemoteComponentLock(
	data: unknown,
): RemoteComponentLockRead {
	const props =
		isRecord(data) && isRecord(data.root) ? data.root.props : undefined;
	const raw = isRecord(props) ? props[REMOTE_COMPONENT_LOCK_KEY] : undefined;
	if (raw === undefined) return { state: "absent" };
	const reason = describeRemoteComponentLockViolation(raw);
	return reason === null
		? { state: "valid", lock: raw as PageComponentLock }
		: { state: "unreadable", raw, reason };
}

export type LockAddition =
	| { readonly kind: "added"; readonly lock: PageComponentLock }
	| { readonly kind: "present"; readonly lock: PageComponentLock }
	| { readonly kind: "refused"; readonly reason: string };

/**
 * Adds one exact release to a lock. A puckType already locked to another
 * release is refused: a saved type is immutable and is never re-pointed
 * (an upgrade is a separate, reviewed decision). An unreadable stored lock is
 * never rewritten.
 */
export function addLockEntry(
	current: RemoteComponentLockRead,
	entry: RemoteComponentLockEntry,
): LockAddition {
	const violation = describeLockEntryViolation(entry);
	if (violation !== null) return { kind: "refused", reason: violation };
	if (current.state === "unreadable") {
		return {
			kind: "refused",
			reason: `the stored lock is unreadable (${current.reason}) and is kept as it is`,
		};
	}
	const entries = current.state === "valid" ? current.lock.entries : [];
	const same = entries.find((e) => e.puckType === entry.puckType);
	if (same) {
		return JSON.stringify(same) === JSON.stringify(entry)
			? { kind: "present", lock: { schemaVersion: 1, entries } }
			: {
					kind: "refused",
					reason: `puckType ${entry.puckType} is locked to release ${same.releaseId}`,
				};
	}
	if (entries.length >= MAX_LOCK_ENTRIES) {
		return {
			kind: "refused",
			reason: `the lock holds ${MAX_LOCK_ENTRIES} entries`,
		};
	}
	const next = [...entries, entry].sort((a, b) =>
		a.puckType < b.puckType ? -1 : a.puckType > b.puckType ? 1 : 0,
	);
	return { kind: "added", lock: { schemaVersion: 1, entries: next } };
}
