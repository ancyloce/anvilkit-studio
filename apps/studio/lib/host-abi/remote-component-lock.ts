/**
 * Schema mirror of `RemoteComponentLockV1` (AnvilKit DD-05 §6.5.2; S1-T04,
 * 2026-09-12), the host-defined root prop `root.props.remoteComponentLock`
 * that pins every remote component a page uses to one exact release.
 *
 * Mirrors `contracts/catalog/remote-component-lock-v1.schema.json` of the
 * platform repository field for field: a `schemaVersion` of 1 and at most 200
 * entries, each carrying `componentId`, `puckType`, `releaseId`,
 * `packageVersion` (exact semver), `releaseManifestDigest` (`sha256:` hex) and
 * `hostProfileId`, sorted by `puckType` with no duplicate type. It is a sibling
 * of `root.props.componentLibrary` (the document-local reusable definitions)
 * and never lives inside it; Puck attaches no meaning to either key.
 *
 * Reading is deliberately three-valued. A value that fails this mirror is
 * classified as `unreadable` and the page writer preserves its exact bytes
 * (`record-ops.ts`) rather than replacing them — the same refuse-to-overwrite
 * rule the local-definition writer applies — so a page whose lock this build
 * cannot parse is still saveable and never silently loses the lock.
 */
export interface RemoteComponentLockEntryV1 {
	readonly componentId: string;
	readonly puckType: string;
	readonly releaseId: string;
	readonly packageVersion: string;
	readonly releaseManifestDigest: string;
	readonly hostProfileId: string;
}

export interface RemoteComponentLockV1 {
	readonly schemaVersion: 1;
	readonly entries: readonly RemoteComponentLockEntryV1[];
}

export type RemoteComponentLockRead =
	| { readonly state: "absent" }
	| { readonly state: "valid"; readonly lock: RemoteComponentLockV1 }
	| {
			readonly state: "unreadable";
			readonly raw: unknown;
			readonly reason: string;
	  };

export const REMOTE_COMPONENT_LOCK_KEY = "remoteComponentLock";
const MAX_ENTRIES = 200;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SEMVER =
	/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const ENTRY_KEYS = [
	"componentId",
	"puckType",
	"releaseId",
	"packageVersion",
	"releaseManifestDigest",
	"hostProfileId",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
	value: unknown,
	maxLength: number,
	pattern?: RegExp,
): value is string {
	return (
		typeof value === "string" &&
		value.length >= 1 &&
		value.length <= maxLength &&
		(pattern === undefined || pattern.test(value))
	);
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
	if (value.entries.length > MAX_ENTRIES) {
		return `entries exceeds ${MAX_ENTRIES}`;
	}
	let previousType: string | null = null;
	for (const [index, entry] of value.entries.entries()) {
		const at = `entries[${index}]`;
		if (!isRecord(entry)) return `${at} is not an object`;
		if (
			Object.keys(entry).some(
				(k) => !(ENTRY_KEYS as readonly string[]).includes(k),
			)
		) {
			return `${at} carries an unknown key`;
		}
		if (!boundedString(entry.componentId, 128, ID)) return `${at}.componentId`;
		if (!boundedString(entry.puckType, 128)) return `${at}.puckType`;
		if (!boundedString(entry.releaseId, 128, ID)) return `${at}.releaseId`;
		if (!boundedString(entry.packageVersion, 128, SEMVER)) {
			return `${at}.packageVersion is not an exact semver`;
		}
		if (!boundedString(entry.releaseManifestDigest, 71, DIGEST)) {
			return `${at}.releaseManifestDigest is not a sha256 digest`;
		}
		if (!boundedString(entry.hostProfileId, 128, ID))
			return `${at}.hostProfileId`;
		if (previousType !== null && entry.puckType <= previousType) {
			return `${at}.puckType is not sorted after "${previousType}" or repeats it`;
		}
		previousType = entry.puckType;
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
		? { state: "valid", lock: raw as RemoteComponentLockV1 }
		: { state: "unreadable", raw, reason };
}
