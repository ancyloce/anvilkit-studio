/**
 * @file The headless artifact render surface (Page Preview Worker input).
 *
 * A preview is evidence about a candidate only if two things hold: the bytes
 * rendered are the bytes the reference names, and they render through the same
 * pipeline publishing uses. Everything here is one of those two claims, or one
 * of the ways the surface must refuse rather than render something.
 *
 * `../puck-demo` is mocked for the same reason the preview-route parity suite
 * mocks it: it value-imports nested-workspace component packages that only
 * Next's `transpilePackages` pipeline resolves.
 */

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ARTIFACT_DIGEST_HEADER,
	ARTIFACT_ID_HEADER,
	ARTIFACT_URL_HEADER,
	loadArtifactRender,
	readArtifactReference,
} from "../artifact-render";
import { resolveDocument } from "../published-render";

vi.mock("../puck-demo", () => ({
	createDemoPagesData: () => ({}),
	demoConfig: {
		components: {
			Navbar: { fields: {}, render: () => null },
		},
	},
}));

const ORIGIN = "https://artifacts.internal";
const ARTIFACT_ID = "artifact.page-candidate.0001";

/**
 * A document the shared validator accepts. The root carries the full
 * `PageRootSchema` shape — title, slug, status, version, parentFolder, seo —
 * because that validator is the same gate a publish must pass, and a fixture
 * that skipped it would only prove this surface accepts things publishing
 * would reject.
 */
const documentFixture = {
	content: [{ type: "Navbar", props: { id: "nav-1" } }],
	root: {
		props: {
			title: "Home",
			slug: "home",
			status: "published",
			version: "1.0.0",
			parentFolder: "/",
			seo: {
				description: "A page rendered from an artifact reference.",
				noIndex: false,
			},
		},
	},
	zones: {},
};

const documentBytes = Buffer.from(JSON.stringify(documentFixture), "utf8");
const documentDigest = `sha256:${createHash("sha256").update(documentBytes).digest("hex")}`;

function reference(overrides: Partial<{ digest: string; url: string }> = {}) {
	return {
		artifactId: ARTIFACT_ID,
		digest: overrides.digest ?? documentDigest,
		url: overrides.url ?? `${ORIGIN}/read/${ARTIFACT_ID}`,
	};
}

function serve(body: Buffer | string, ok = true): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok,
			arrayBuffer: async () =>
				typeof body === "string"
					? new TextEncoder().encode(body).buffer
					: body.buffer.slice(
							body.byteOffset,
							body.byteOffset + body.byteLength,
						),
		})),
	);
}

beforeEach(() => {
	vi.stubEnv("ANVILKIT_PREVIEW_RENDER", "1");
	vi.stubEnv("ANVILKIT_PREVIEW_ARTIFACT_ORIGINS", ORIGIN);
	serve(documentBytes);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("reading the reference", () => {
	it("accepts a complete reference off request headers", () => {
		const parsed = readArtifactReference(
			new Headers({
				[ARTIFACT_ID_HEADER]: ARTIFACT_ID,
				[ARTIFACT_DIGEST_HEADER]: documentDigest,
				[ARTIFACT_URL_HEADER]: `${ORIGIN}/read/x`,
			}),
		);
		expect(parsed).toEqual({
			artifactId: ARTIFACT_ID,
			digest: documentDigest,
			url: `${ORIGIN}/read/x`,
		});
	});

	it.each([
		["no headers at all", {}],
		["missing url", { [ARTIFACT_ID_HEADER]: ARTIFACT_ID, [ARTIFACT_DIGEST_HEADER]: documentDigest }],
		["a digest that is not sha256", { [ARTIFACT_ID_HEADER]: ARTIFACT_ID, [ARTIFACT_DIGEST_HEADER]: "md5:abc", [ARTIFACT_URL_HEADER]: `${ORIGIN}/x` }],
		["an unbounded artifact id", { [ARTIFACT_ID_HEADER]: "a".repeat(129), [ARTIFACT_DIGEST_HEADER]: documentDigest, [ARTIFACT_URL_HEADER]: `${ORIGIN}/x` }],
	])("refuses %s", (_name, headers) => {
		expect(readArtifactReference(new Headers(headers as Record<string, string>))).toBeNull();
	});
});

describe("denial by default", () => {
	it("renders nothing when the surface is not enabled", async () => {
		vi.stubEnv("ANVILKIT_PREVIEW_RENDER", "");
		await expect(loadArtifactRender(reference())).resolves.toEqual({
			ok: false,
			refusal: "not-configured",
		});
	});

	it("reaches no origin when the allowlist is empty", async () => {
		// An allowlist defaulting to "anything" would make the setting decorative.
		vi.stubEnv("ANVILKIT_PREVIEW_ARTIFACT_ORIGINS", "");
		await expect(loadArtifactRender(reference())).resolves.toEqual({
			ok: false,
			refusal: "destination-not-allowed",
		});
	});

	it.each([
		["an origin outside the allowlist", "https://elsewhere.example/read/x"],
		["a lookalike host", "https://artifacts.internal.evil.example/read/x"],
		["plaintext http", "http://artifacts.internal/read/x"],
		["a non-URL", "not-a-url"],
	])("refuses %s", async (_name, url) => {
		await expect(loadArtifactRender(reference({ url }))).resolves.toEqual({
			ok: false,
			refusal: "destination-not-allowed",
		});
	});
});

describe("the bytes must be the bytes the reference names", () => {
	it("renders the document when the digest matches", async () => {
		const outcome = await loadArtifactRender(reference());
		expect(outcome.ok).toBe(true);
	});

	it("refuses when the served bytes hash to something else", async () => {
		// The URL is allowed and the response is fine — only the content differs.
		// Without this check the surface would render whatever the origin chose.
		serve(Buffer.from(JSON.stringify({ ...documentFixture, zones: { a: [] } })));
		await expect(loadArtifactRender(reference())).resolves.toEqual({
			ok: false,
			refusal: "digest-mismatch",
		});
	});

	it("refuses an unreadable response rather than rendering an empty page", async () => {
		serve(documentBytes, false);
		await expect(loadArtifactRender(reference())).resolves.toEqual({
			ok: false,
			refusal: "unreadable",
		});
	});

	it("refuses a fetch failure without echoing it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("connect ECONNREFUSED 10.1.2.3:443");
			}),
		);
		const outcome = await loadArtifactRender(reference());
		expect(outcome).toEqual({ ok: false, refusal: "unreadable" });
		// The refusal travels into a durable result; an internal host must not.
		expect(JSON.stringify(outcome)).not.toContain("10.1.2.3");
	});
});

describe("authentic bytes are still not automatically a page", () => {
	it.each([
		["JSON that is not a page document", JSON.stringify({ hello: "world" })],
		["content that is not JSON at all", "<html>not json</html>"],
	])("refuses %s", async (_name, body) => {
		const bytes = Buffer.from(body, "utf8");
		serve(bytes);
		const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
		// The digest matches, so only the validator stands between this and a render.
		await expect(loadArtifactRender(reference({ digest }))).resolves.toEqual({
			ok: false,
			refusal: "not-a-page-document",
		});
	});
});

describe("parity with the published pipeline", () => {
	it("resolves identically to the document the store path would render", async () => {
		// The claim that makes a preview evidence: this surface and the published
		// route hand `<AnvilKitRender>` the same value for the same document. A
		// second resolution path would produce evidence about that path instead.
		const outcome = await loadArtifactRender(reference());
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const viaStorePipeline = await resolveDocument(
			structuredClone(documentFixture) as never,
		);
		expect(outcome.document).toEqual(viaStorePipeline);
	});
});
