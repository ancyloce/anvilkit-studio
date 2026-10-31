import type { ComponentConfig, Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	addLockEntry,
	type RemoteComponentLockEntry,
	readRemoteComponentLock,
} from "../host-abi/remote-component-lock";
import {
	buildSessionConfig,
	collectTypes,
	facadePath,
	type LoadOutcome,
	type PlaceholderRender,
	ReleaseRejected,
	rewriteImports,
	sha256,
	verifyFile,
	verifyManifest,
	withDocumentTypes,
} from "../host-abi/remote-loader";

const enc = (s: string) => new TextEncoder().encode(s);

const manifestFor = (
	entry: Omit<RemoteComponentLockEntry, "browserManifestDigest">,
) =>
	enc(
		JSON.stringify({
			schemaVersion: 1,
			hostProfileId: entry.hostProfileId,
			identity: {
				componentId: entry.componentId,
				puckType: entry.puckType,
				releaseId: entry.releaseId,
				packageName: entry.packageName,
				packageVersion: entry.packageVersion,
			},
			entry: {
				path: "index.js",
				digest: `sha256:${"b".repeat(64)}`,
				sizeBytes: "10",
			},
			styles: [],
		}),
	);

const identity = {
	schemaVersion: 1 as const,
	componentId: "cmp-card",
	puckType: "RemoteCard",
	releaseId: "rel-card-1",
	packageName: "@acme/card",
	packageVersion: "1.2.3",
	hostProfileId: "studio-host-v1",
};

async function lockEntry(): Promise<RemoteComponentLockEntry> {
	return {
		...identity,
		browserManifestDigest: await sha256(manifestFor(identity)),
	};
}

const render = (() => null) as unknown as PlaceholderRender;
const builtIn = (label: string) =>
	({ label, render: () => null }) as unknown as ComponentConfig;

describe("page component lock", () => {
	it("reads the contract shape and refuses the S1 shape", async () => {
		const entry = await lockEntry();
		const valid = {
			root: {
				props: { remoteComponentLock: { schemaVersion: 1, entries: [entry] } },
			},
		};
		expect(readRemoteComponentLock(valid).state).toBe("valid");
		const {
			packageName: _n,
			browserManifestDigest: _d,
			schemaVersion: _s,
			...rest
		} = entry;
		const s1 = {
			root: {
				props: {
					remoteComponentLock: {
						schemaVersion: 1,
						entries: [
							{ ...rest, releaseManifestDigest: entry.browserManifestDigest },
						],
					},
				},
			},
		};
		expect(readRemoteComponentLock(s1).state).toBe("unreadable");
		const lowercaseType = {
			root: {
				props: {
					remoteComponentLock: {
						schemaVersion: 1,
						entries: [{ ...entry, puckType: "remoteCard" }],
					},
				},
			},
		};
		expect(readRemoteComponentLock(lowercaseType).state).toBe("unreadable");
	});

	it("adds exact releases sorted, refuses re-pointing a type and never rewrites an unreadable lock", async () => {
		const card = await lockEntry();
		const banner = {
			...card,
			puckType: "Banner",
			componentId: "cmp-banner",
			releaseId: "rel-banner-1",
		};
		let lock = addLockEntry({ state: "absent" }, card);
		expect(lock.kind).toBe("added");
		if (lock.kind !== "added") return;
		lock = addLockEntry({ state: "valid", lock: lock.lock }, banner);
		expect(
			lock.kind === "added" && lock.lock.entries.map((e) => e.puckType),
		).toEqual(["Banner", "RemoteCard"]);
		if (lock.kind !== "added") return;
		expect(addLockEntry({ state: "valid", lock: lock.lock }, card).kind).toBe(
			"present",
		);
		expect(
			addLockEntry(
				{ state: "valid", lock: lock.lock },
				{ ...card, releaseId: "rel-card-2" },
			),
		).toMatchObject({ kind: "refused" });
		expect(
			addLockEntry({ state: "unreadable", raw: {}, reason: "x" }, card),
		).toMatchObject({ kind: "refused" });
	});
});

describe("release verification", () => {
	it("binds the manifest to the locked digest, identity and host profile", async () => {
		const entry = await lockEntry();
		await expect(
			verifyManifest(manifestFor(identity), entry, "studio-host-v1"),
		).resolves.toMatchObject({ entry: { path: "index.js" } });
		await expect(
			verifyManifest(
				manifestFor({ ...identity, packageVersion: "1.2.4" }),
				entry,
				"studio-host-v1",
			),
		).rejects.toThrow(/locked digest/);
		const otherType = { ...identity, puckType: "Other" };
		await expect(
			verifyManifest(
				manifestFor(otherType),
				{
					...entry,
					browserManifestDigest: await sha256(manifestFor(otherType)),
				},
				"studio-host-v1",
			),
		).rejects.toThrow(/puckType/);
		await expect(
			verifyManifest(manifestFor(identity), entry, "host-abi-dev-v1"),
		).rejects.toThrow(/host profile/);
	});

	it("checks file bytes and size", async () => {
		const bytes = enc("export default 1;\n");
		await expect(
			verifyFile(bytes, {
				path: "index.js",
				digest: await sha256(bytes),
				sizeBytes: String(bytes.byteLength),
			}),
		).resolves.toBeUndefined();
		await expect(
			verifyFile(bytes, {
				path: "index.js",
				digest: await sha256(bytes),
				sizeBytes: "1",
			}),
		).rejects.toBeInstanceOf(ReleaseRejected);
	});

	it("rewrites only registered specifiers to facades and refuses anything else", () => {
		const specs = ["react", "react/jsx-runtime", "@puckeditor/core"];
		const out = rewriteImports(
			'import { jsx } from "react/jsx-runtime";\nimport * as React from "react";\nexport { x } from "@puckeditor/core";\n',
			"http://localhost:3000",
			"studio-host-v1",
			specs,
		);
		expect(out).toContain(
			`from "http://localhost:3000${facadePath("studio-host-v1", "react/jsx-runtime")}"`,
		);
		expect(out).toContain(
			"http://localhost:3000/host/studio-host-v1/facades/react.js",
		);
		expect(out).toContain("/host/studio-host-v1/facades/puckeditor-core.js");
		expect(() =>
			rewriteImports('import x from "lodash";', "o", "p", specs),
		).toThrow(/lodash/);
		expect(() =>
			rewriteImports('import x from "./chunk.js";', "o", "p", specs),
		).toThrow(/chunk/);
		expect(() =>
			rewriteImports('const m = import("react");', "o", "p", specs),
		).toThrow(/dynamically/);
	});
});

describe("session config", () => {
	const base = {
		categories: { basic: { title: "Basic", components: ["Hero", "Text"] } },
		components: { Hero: builtIn("built-in hero"), Text: builtIn("text") },
	} as unknown as Config;

	it("reserves locked types before built-ins and reports the collision", async () => {
		const entry = { ...(await lockEntry()), puckType: "Hero" };
		const remote = builtIn("remote hero");
		const lock = readRemoteComponentLock({
			root: {
				props: { remoteComponentLock: { schemaVersion: 1, entries: [entry] } },
			},
		});
		const outcomes: LoadOutcome[] = [{ kind: "loaded", entry, config: remote }];
		const s = buildSessionConfig(
			base,
			lock,
			outcomes,
			{ content: [{ type: "Hero", props: { id: "h1" } }] },
			render,
		);
		expect(s.config.components.Hero).toBe(remote);
		expect(s.collisions).toEqual(["Hero"]);
		expect(s.remote).toEqual(["Hero"]);
		expect(s.config.categories?.basic?.components).toEqual(["Text"]);
		expect(s.config.components.Text).toBe(base.components.Text);
	});

	it("gives unavailable releases, unreadable locks and unknown types lossless placeholders", async () => {
		const entry = await lockEntry();
		const lock = readRemoteComponentLock({
			root: {
				props: { remoteComponentLock: { schemaVersion: 1, entries: [entry] } },
			},
		});
		const data = {
			content: [
				{
					type: "RemoteCard",
					props: { id: "c1", title: "kept", secret: { nested: true } },
				},
				{
					type: "Mystery",
					props: { id: "m1", slot: [{ type: "Deeper", props: { id: "d1" } }] },
				},
			],
			root: {
				props: { remoteComponentLock: { schemaVersion: 1, entries: [entry] } },
			},
		};
		const s = buildSessionConfig(
			base,
			lock,
			[{ kind: "unavailable", entry, reason: "HTTP 404" }],
			data,
			render,
		);
		expect(s.remote).toEqual([]);
		expect(s.placeholders.map((p) => p.puckType).sort()).toEqual([
			"Deeper",
			"Mystery",
			"RemoteCard",
		]);
		const placeholder = s.config.components.RemoteCard as unknown as Record<
			string,
			unknown
		>;
		expect(placeholder.fields).toEqual({});
		expect(placeholder.defaultProps).toBeUndefined();
		expect(placeholder.resolveData).toBeUndefined();
		expect(placeholder.permissions).toEqual({
			insert: false,
			duplicate: false,
			edit: false,
		});
		const unreadable = buildSessionConfig(
			base,
			{ state: "unreadable", raw: {}, reason: "S1 shape" },
			[],
			data,
			render,
		);
		expect(
			unreadable.placeholders.find((p) => p.puckType === "RemoteCard")?.reason,
		).toMatchObject({ kind: "unlocked" });
	});

	it("collects node types from content, zones and slots, not from the lock", () => {
		expect(
			[
				...collectTypes({
					content: [
						{
							type: "A",
							props: { id: "a", items: [{ type: "B", props: { id: "b" } }] },
						},
					],
					zones: { "a:zone": [{ type: "C", props: { id: "c" } }] },
					root: {
						props: {
							remoteComponentLock: {
								entries: [{ type: "NotANode", props: {} }],
							},
						},
					},
				}),
			].sort(),
		).toEqual(["A", "B", "C"]);
	});
});

describe("document guard config", () => {
	it("adds inert entries only for types no built-in provides", () => {
		const base = { components: { Hero: builtIn("hero") } } as unknown as Config;
		expect(
			withDocumentTypes(base, {
				content: [{ type: "Hero", props: { id: "h" } }],
			}),
		).toBe(base);
		const extended = withDocumentTypes(base, {
			content: [
				{ type: "Hero", props: { id: "h" } },
				{ type: "RemoteCard", props: { id: "r" } },
			],
		});
		expect(extended.components.Hero).toBe(base.components.Hero);
		expect(Object.keys(extended.components).sort()).toEqual([
			"Hero",
			"RemoteCard",
		]);
	});
});
