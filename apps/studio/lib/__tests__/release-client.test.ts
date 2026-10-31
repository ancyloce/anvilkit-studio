import { describe, expect, it } from "vitest";
import {
	deliveredLock,
	type Release,
	releaseRequest,
	releaseStanding,
} from "../agent/release-client";

const D = `sha256:${"a".repeat(64)}`;
const M = `sha256:${"d".repeat(64)}`;

function activated(): Release {
	return {
		operationId: "op_rel",
		lineage: D,
		sourceRevision: "4",
		state: "activated",
		releaseId: "rel_1",
		subject: {
			componentId: "cmp_hero",
			puckType: "Hero",
			sourceRevision: "4",
			sourceDigest: D,
			packageName: "@anvilkit/hero",
			version: "1.0.0",
			npm: { digest: D, sizeBytes: "10" },
			browser: { digest: D, sizeBytes: "10" },
			css: [{ digest: D, sizeBytes: "3" }],
			buildProfileId: "build-support-dev-v1",
			buildProfileDigest: D,
			validatorProfileId: "validator-dev-v1",
			validatorProfileDigest: D,
			hostAbi: "host-abi-dev-v1",
			hostAbiDigest: D,
			destinations: {
				npmRegistry: "https://registry.anvilkit.invalid/",
				browserOrigin: "https://components.anvilkit.invalid",
			},
			certificationEvidenceDigest: D,
			subjectDigest: D,
		},
		approval: { state: "approved", subjectDigest: D },
		npm: { state: "succeeded" },
		browser: { state: "succeeded", manifestDigest: M },
		activation: { state: "succeeded" },
		lock: {
			schemaVersion: 1,
			componentId: "cmp_hero",
			puckType: "Hero",
			releaseId: "rel_1",
			packageName: "@anvilkit/hero",
			packageVersion: "1.0.0",
			browserManifestDigest: M,
			hostProfileId: "host-abi-dev-v1",
		},
		revision: "6",
		updatedAt: "2026-09-30T12:00:00Z",
	};
}

describe("release helpers", () => {
	it("requests the exact saved revision by its source operation, never a destination or artifact", () => {
		expect(
			releaseRequest({
				sourceOperationId: "op_prv",
				lineage: D,
				sourceRevision: "4",
				packageVersion: "1.0.0",
			}),
		).toEqual({
			kind: "release",
			subject: {
				profileId: "release-v1",
				subjectDigest: D,
				sourceRevision: "4",
				sourceOperationId: "op_prv",
				packageVersion: "1.0.0",
			},
		});
		expect(() =>
			releaseRequest({
				sourceOperationId: "op_prv",
				lineage: D,
				sourceRevision: "4",
				packageVersion: "latest",
			}),
		).toThrow();
	});

	it("pins only an activated release whose lock binds its approved subject", () => {
		expect(deliveredLock(activated())?.releaseId).toBe("rel_1");
		expect(releaseStanding(activated())).toBe("delivered");
		const published = { ...activated(), state: "published" as const };
		expect(deliveredLock(published)).toBeNull();
		const partial: Release = {
			...activated(),
			state: "partially_published",
			browser: { state: "failed", failureCode: "DESTINATION_MISMATCH" },
		};
		expect(deliveredLock(partial)).toBeNull();
		expect(releaseStanding(partial)).toBe("not_delivered");
		const stale = activated();
		const approval = { state: "approved" as const, subjectDigest: M };
		expect(deliveredLock({ ...stale, approval })).toBeNull();
		const other = activated();
		expect(
			deliveredLock({
				...other,
				lock: {
					...(other.lock as NonNullable<Release["lock"]>),
					packageVersion: "1.0.1",
				},
			}),
		).toBeNull();
		expect(
			deliveredLock({
				...other,
				lock: {
					...(other.lock as NonNullable<Release["lock"]>),
					browserManifestDigest: D,
				},
			}),
		).toBeNull();
		expect(releaseStanding({ ...activated(), state: "reconciling" })).toBe(
			"uncertain",
		);
	});
});
