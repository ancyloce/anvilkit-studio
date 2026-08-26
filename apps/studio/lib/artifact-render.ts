/**
 * @file Headless render of a page document supplied as an **artifact
 * reference**, for the Page Preview Worker.
 *
 * The worker screenshots a candidate under stated conditions and the result is
 * evidence a reviewer relies on. Evidence is only about the candidate if the
 * bytes rendered are the bytes the reference names, and if they render through
 * the same pipeline the published route uses — hence the digest check here and
 * `resolveDocument` shared with `published-render`.
 *
 * The document arrives by reference, never inline: the reference plus a
 * bounded, expiring read capability, exactly as the artifact owner issued it.
 * A URL alone would let any caller name any destination.
 *
 * **Denied by default.** This surface fetches a caller-named URL and renders
 * what comes back, so an unconfigured deployment must not expose it at all,
 * and a configured one reaches only origins it was told about. Both are read
 * at point of use, matching this app's existing configuration style.
 */

import { validatePuckPageData } from "@anvilkit/validator";
import { createHash } from "node:crypto";
import type { DemoPageData } from "./page-storage/types";
import { resolveDocument } from "./published-render";

/** Header names the worker sets. Kept together so the contract is one place. */
export const ARTIFACT_ID_HEADER = "x-anvilkit-artifact-id";
export const ARTIFACT_DIGEST_HEADER = "x-anvilkit-artifact-digest";
export const ARTIFACT_URL_HEADER = "x-anvilkit-artifact-url";

/** Bounds one fetch. A hostile or misconfigured origin must not exhaust us. */
const DEFAULT_TIMEOUT_MS = 10_000;
const MAXIMUM_DOCUMENT_BYTES = 786_432;

/**
 * One artifact the caller asks to be rendered: what it is, what it must hash
 * to, and the bounded capability to read it.
 */
export interface ArtifactReference {
	readonly artifactId: string;
	/** `sha256:<64 hex>` — the digest the fetched bytes must produce. */
	readonly digest: string;
	/** The expiring read URL the artifact owner signed. */
	readonly url: string;
}

export type ArtifactRenderRefusal =
	| "not-configured"
	| "malformed-reference"
	| "destination-not-allowed"
	| "unreadable"
	| "too-large"
	| "digest-mismatch"
	| "not-a-page-document";

export type ArtifactRenderOutcome =
	| { readonly ok: true; readonly document: DemoPageData }
	| { readonly ok: false; readonly refusal: ArtifactRenderRefusal };

/** Enabled only when explicitly turned on; absent configuration means absent route. */
export function artifactRenderEnabled(): boolean {
	return process.env.ANVILKIT_PREVIEW_RENDER === "1";
}

/**
 * Origins this deployment may read artifacts from. Empty means none: an
 * allowlist that defaulted to "anything" would make the setting decorative.
 */
function allowedOrigins(): ReadonlySet<string> {
	const raw = process.env.ANVILKIT_PREVIEW_ARTIFACT_ORIGINS ?? "";
	return new Set(
		raw
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0),
	);
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Read the reference off request headers, or refuse. Headers rather than query
 * parameters because the capability travels with it: query strings are logged,
 * kept in referrers, and survive in screenshots of the address bar.
 */
export function readArtifactReference(
	headers: Headers,
): ArtifactReference | null {
	const artifactId = headers.get(ARTIFACT_ID_HEADER)?.trim() ?? "";
	const digest = headers.get(ARTIFACT_DIGEST_HEADER)?.trim() ?? "";
	const url = headers.get(ARTIFACT_URL_HEADER)?.trim() ?? "";
	if (artifactId.length === 0 || artifactId.length > 128) return null;
	if (!DIGEST_PATTERN.test(digest)) return null;
	if (url.length === 0) return null;
	return { artifactId, digest, url };
}

/** Only `https:` destinations on the configured allowlist are reachable. */
function destinationAllowed(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "https:") return false;
	return allowedOrigins().has(parsed.origin);
}

function resolveTimeoutMs(): number {
	const raw = Number(process.env.ANVILKIT_PREVIEW_FETCH_TIMEOUT_MS);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Fetch, verify, and resolve the referenced document.
 *
 * Every failure is a refusal rather than a partial render: a preview that
 * rendered *something* when the document could not be proved would be evidence
 * about nothing, and it would look identical to a successful one.
 */
export async function loadArtifactRender(
	reference: ArtifactReference,
): Promise<ArtifactRenderOutcome> {
	if (!artifactRenderEnabled()) return { ok: false, refusal: "not-configured" };
	if (!destinationAllowed(reference.url)) {
		return { ok: false, refusal: "destination-not-allowed" };
	}

	let response: Response;
	try {
		response = await fetch(reference.url, {
			// A redirect would leave the allowlist behind, so the capability is
			// followed exactly as far as it was issued for.
			redirect: "error",
			signal: AbortSignal.timeout(resolveTimeoutMs()),
			headers: { accept: "application/json" },
		});
	} catch {
		// The failure is not echoed: it can name internal hosts, and this
		// refusal travels back to the worker and into a durable result.
		return { ok: false, refusal: "unreadable" };
	}
	if (!response.ok) return { ok: false, refusal: "unreadable" };

	const body = await response.arrayBuffer();
	if (body.byteLength > MAXIMUM_DOCUMENT_BYTES) {
		return { ok: false, refusal: "too-large" };
	}
	const bytes = new Uint8Array(body);

	// Over the exact bytes received, before anything parses them: this is what
	// makes the render evidence about the artifact the reference names.
	const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
	if (actual !== reference.digest) {
		return { ok: false, refusal: "digest-mismatch" };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return { ok: false, refusal: "not-a-page-document" };
	}
	// The bytes are proved authentic; that does not make them a page. The same
	// validator a publish must pass decides, so the render surface can never
	// accept a document the store would have rejected.
	if (!validatePuckPageData(parsed).valid) {
		return { ok: false, refusal: "not-a-page-document" };
	}

	// The cast is what the validator just earned: `validatePuckPageData` proves
	// the structural shape the renderer depends on, but returns a result rather
	// than narrowing the type.
	const document = await resolveDocument(parsed as DemoPageData);
	return { ok: true, document };
}
