/**
 * @file Release helpers of the Studio (P21): the API-02 release request for
 * an exact saved revision, and the lock a page may pin from a release.
 *
 * Approval, publication and activation are the source authority's facts as
 * the release recorded them. A release is delivered only when it is
 * activated with both verified receipts; its lock is then taken exactly as
 * the platform states it and checked against the approved subject, never
 * rebuilt from a catalog's latest entry.
 */
import type { components } from "./generated/agent";

type Schemas = components["schemas"];
export type Release = Schemas["Release"];
export type ReleaseLock = Schemas["ReleaseLock"];

/** The reviewed release profile of the platform. */
export const RELEASE_PROFILE_ID = "release-v1";

const SEMVER =
	/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;

/**
 * The body of API-02 for releasing the saved revision of a source
 * operation (without the commandId the tracked command adds). The caller
 * names neither the artifact nor a destination: the platform binds the
 * saved bytes and the release profile's destinations.
 */
export function releaseRequest(input: {
	readonly sourceOperationId: string;
	readonly lineage: string;
	readonly sourceRevision: string;
	readonly packageVersion: string;
}): Record<string, unknown> {
	if (!SEMVER.test(input.packageVersion))
		throw new Error("the package version must be an exact semver");
	return {
		kind: "release",
		subject: {
			profileId: RELEASE_PROFILE_ID,
			subjectDigest: input.lineage,
			sourceRevision: input.sourceRevision,
			sourceOperationId: input.sourceOperationId,
			packageVersion: input.packageVersion,
		},
	};
}

/**
 * The exact lock of a delivered release, or null. Delivered means
 * activated, both targets succeeded, the approval binds exactly the
 * subject, and the lock names the subject's component, type, package,
 * version and host profile and the browser receipt's manifest digest.
 */
export function deliveredLock(release: Release): ReleaseLock | null {
	const { lock, subject, approval } = release;
	if (
		release.state !== "activated" ||
		!lock ||
		!subject ||
		!approval ||
		approval.state !== "approved" ||
		approval.subjectDigest !== subject.subjectDigest ||
		release.npm.state !== "succeeded" ||
		release.browser.state !== "succeeded" ||
		release.activation.state !== "succeeded"
	)
		return null;
	if (
		lock.componentId !== subject.componentId ||
		lock.puckType !== subject.puckType ||
		lock.packageName !== subject.packageName ||
		lock.packageVersion !== subject.version ||
		lock.hostProfileId !== subject.hostAbi ||
		lock.releaseId !== release.releaseId ||
		lock.browserManifestDigest !== release.browser.manifestDigest
	)
		return null;
	return lock;
}

/** What the release view tells the maintainer about the aggregate. */
export type ReleaseStanding =
	| "certifying"
	| "awaiting_approval"
	| "publishing"
	| "delivered"
	| "not_delivered"
	| "uncertain";

export function releaseStanding(release: Release): ReleaseStanding {
	switch (release.state) {
		case "certifying":
		case "awaiting_approval":
		case "publishing":
			return release.state;
		case "activated":
			return deliveredLock(release) ? "delivered" : "not_delivered";
		case "reconciling":
			return "uncertain";
		default:
			// published (not yet current), partially_published, rejected,
			// failed: nothing a page may pin.
			return "not_delivered";
	}
}
