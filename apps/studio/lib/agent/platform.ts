/**
 * @file Server-side gateway from the Studio's `/api/agent/*` route handlers
 * to the AnvilKit Agent API `/api/v1` (P20, DD-05 §1/§5).
 *
 * The browser never holds a platform credential: the Studio server forwards
 * with `ANVILKIT_AGENT_API_TOKEN` (the controlled development identity of one
 * actor and tenant until ENV-07) and passes the Agent API's status, headers
 * that matter and body back unchanged, including its error envelope, so the
 * client sees exactly what Control, Knowledge or MCP decided. Only the
 * contract's own paths and methods are forwarded. It adds no business
 * decision; artifact uploads (prompt, answer, edited source) run here so
 * upload capabilities never reach the browser.
 */
import { createHash } from "node:crypto";
import type { components } from "./generated/agent";

type Schemas = components["schemas"];

export interface PlatformConfig {
	readonly baseUrl: string;
	readonly token: string;
}

/** Reads the configuration; `null` when the Agent API is not configured. */
export function platformFromEnv(
	env: Readonly<Record<string, string | undefined>> = process.env,
): PlatformConfig | null {
	const baseUrl = env.ANVILKIT_AGENT_API_URL?.trim();
	const token = env.ANVILKIT_AGENT_API_TOKEN?.trim();
	if (!baseUrl || !token) return null;
	return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

/** The contract's error envelope (`ErrorEnvelope`). */
export function errorEnvelope(
	status: number,
	code: Schemas["ErrorCode"],
	message: string,
	retryable: boolean,
): Response {
	return Response.json(
		{ error: { code, message, requestId: "studio", retryable } },
		{ status, headers: { "Cache-Control": "no-store" } },
	);
}

export const notConfigured = (): Response =>
	errorEnvelope(
		503,
		"DEPENDENCY_UNAVAILABLE",
		"The Agent API is not configured for this Studio server (ANVILKIT_AGENT_API_URL and ANVILKIT_AGENT_API_TOKEN).",
		false,
	);

export const unreachable = (): Response =>
	errorEnvelope(
		503,
		"DEPENDENCY_UNAVAILABLE",
		"The Agent API did not answer.",
		true,
	);

/**
 * The contract's paths (relative to `/api/v1`) and the methods the Studio
 * forwards for each; the SSE path streams.
 */
const ROUTES: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
	[/^preparations$/, ["POST"]],
	[/^preparations\/[^/]+\/answers$/, ["POST"]],
	[/^operations$/, ["POST"]],
	[/^operations\/[^/]+$/, ["GET"]],
	[/^operations\/[^/]+\/events$/, ["GET"]],
	[/^operations\/[^/]+\/commands$/, ["POST"]],
	[/^operations\/[^/]+\/commands\/[^/]+$/, ["GET"]],
	[/^operations\/[^/]+\/preview$/, ["GET"]],
	[/^operations\/[^/]+\/preview\/artifacts\/sha256:[0-9a-f]{64}$/, ["GET"]],
	[/^operations\/[^/]+\/source$/, ["GET"]],
	[/^operations\/[^/]+\/release$/, ["GET"]],
	[/^knowledge\/sources$/, ["GET", "POST"]],
	[/^knowledge\/sources\/[^/]+$/, ["GET", "DELETE"]],
	[/^knowledge\/sources\/[^/]+\/access$/, ["PUT"]],
	[/^knowledge\/searches$/, ["POST"]],
	// P2.6: snapshots and recall (the upload capability never passes this
	// proxy: /api/agent/knowledge/uploads performs the upload server-side).
	[/^knowledge\/snapshots$/, ["POST"]],
	[/^knowledge\/snapshots\/[^/]+$/, ["GET"]],
	[/^memories\/recalls$/, ["POST"]],
	[/^memories$/, ["GET", "POST"]],
	[/^memories\/[^/]+\/decisions$/, ["POST"]],
	[/^mcp\/catalog$/, ["GET"]],
	[/^mcp\/catalog\/discoveries$/, ["POST"]],
	[/^mcp\/catalog\/[^/]+\/reviews$/, ["POST"]],
	[/^mcp\/grants$/, ["GET", "POST"]],
	[/^mcp\/grants\/[^/]+$/, ["GET"]],
	[/^mcp\/grants\/[^/]+\/revocation$/, ["GET"]],
	[/^mcp\/grants\/[^/]+\/revocations$/, ["POST"]],
	[/^mcp\/calls$/, ["POST"]],
	[/^mcp\/calls\/[^/]+$/, ["GET"]],
];

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Whether `/api/v1/<path>` may be forwarded with `method`. */
export function forwardable(path: string, method: string): boolean {
	const segments = path.split("/");
	if (
		segments.some(
			(s) => s === "" || s === "." || s === ".." || !SEGMENT.test(s),
		)
	)
		return false;
	return ROUTES.some(
		([pattern, methods]) => pattern.test(path) && methods.includes(method),
	);
}

/** One request to `/api/v1/<path>` with the server-held credential. */
export async function platformFetch(
	config: PlatformConfig,
	method: string,
	path: string,
	init: {
		body?: BodyInit;
		json?: unknown;
		headers?: Record<string, string>;
		signal?: AbortSignal;
	} = {},
): Promise<Response> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${config.token}`,
		...init.headers,
	};
	let body = init.body;
	if (init.json !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(init.json);
	}
	return fetch(`${config.baseUrl}/api/v1/${path}`, {
		method,
		headers,
		body,
		signal: init.signal,
		cache: "no-store",
		redirect: "manual",
	});
}

export function sha256Digest(bytes: Uint8Array): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export interface UploadedArtifact {
	readonly transferId: string;
	readonly handle: string;
	readonly digest: string;
}

export class PlatformError extends Error {
	constructor(readonly response: Response) {
		super(`platform answered ${response.status}`);
	}
}

/**
 * Uploads bytes as one artifact: begin the transfer, PUT the exact bytes to
 * the one-use capability, finalize the object version. The command ids are
 * derived from the caller's, so a retry of the same command resolves to the
 * same transfer instead of a second one.
 */
export async function uploadArtifact(
	config: PlatformConfig,
	input: {
		commandId: string;
		class: Schemas["ArtifactClass"];
		mediaType: string;
		bytes: Uint8Array;
		signal?: AbortSignal;
	},
): Promise<UploadedArtifact> {
	const digest = sha256Digest(input.bytes);
	const begun = await platformFetch(config, "POST", "artifacts/transfers", {
		json: {
			commandId: `${input.commandId}.xfer`,
			class: input.class,
			mediaType: input.mediaType,
			expectedDigest: digest,
			expectedSize: String(input.bytes.byteLength),
		},
		signal: input.signal,
	});
	if (begun.status !== 201 && begun.status !== 200)
		throw new PlatformError(begun);
	const transfer = (await begun.json()) as Schemas["Transfer"];
	if (transfer.state === "finalized") {
		return { transferId: transfer.transferId, handle: transfer.handle, digest };
	}
	if (!transfer.uploadCapability || !transfer.uploadMethod) {
		throw new PlatformError(
			errorEnvelope(
				503,
				"DEPENDENCY_UNAVAILABLE",
				"The transfer carries no upload capability.",
				true,
			),
		);
	}
	const headers: Record<string, string> = {};
	for (const [k, v] of Object.entries(transfer.uploadHeaders ?? {})) {
		if (k.toLowerCase() !== "content-length") headers[k] = String(v);
	}
	const put = await fetch(transfer.uploadCapability, {
		method: transfer.uploadMethod,
		headers,
		body: new Blob([new Uint8Array(input.bytes)]),
		signal: input.signal,
		redirect: "manual",
	});
	if (!put.ok) {
		throw new PlatformError(
			errorEnvelope(
				503,
				"DEPENDENCY_UNAVAILABLE",
				`The artifact store answered ${put.status}.`,
				true,
			),
		);
	}
	const version = put.headers.get("x-amz-version-id") ?? "";
	if (version === "" || version === "null") {
		throw new PlatformError(
			errorEnvelope(
				503,
				"DEPENDENCY_UNAVAILABLE",
				"The artifact store named no object version (versioning is off).",
				false,
			),
		);
	}
	// The contract's Handle pattern; it goes into the path verbatim (the API
	// refuses a percent-encoded colon).
	if (!/^[A-Za-z0-9._:-]{1,256}$/.test(transfer.handle)) {
		throw new PlatformError(
			errorEnvelope(
				503,
				"DEPENDENCY_UNAVAILABLE",
				"The transfer handle is malformed.",
				false,
			),
		);
	}
	const finalized = await platformFetch(
		config,
		"POST",
		`artifacts/${transfer.handle}/finalizations`,
		{
			json: { commandId: `${input.commandId}.fin`, objectVersion: version },
			signal: input.signal,
		},
	);
	if (finalized.status !== 200) throw new PlatformError(finalized);
	const done = (await finalized.json()) as Schemas["Transfer"];
	return { transferId: done.transferId, handle: done.handle, digest };
}

/**
 * P2.6: uploads one document and registers it as a knowledge source: begin
 * the single-use upload capability (bound to the bytes' digest, size and
 * media type), PUT exactly those bytes with the signed headers, register
 * `upload:<uploadId>`. Runs server-side only: the capability never reaches
 * the browser. Command ids derive from the caller's, so a retry of the same
 * command resolves to the same upload and the same source. Answers the
 * registration's response (202 with the source, or its error envelope).
 */
export async function uploadSource(
	config: PlatformConfig,
	input: {
		commandId: string;
		mediaType: string;
		bytes: Uint8Array;
		access?: Schemas["AccessEntry"][];
		signal?: AbortSignal;
	},
): Promise<Response> {
	const digest = sha256Digest(input.bytes);
	const sizeBytes = String(input.bytes.byteLength);
	const begun = await platformFetch(
		config,
		"POST",
		"knowledge/sources/uploads",
		{
			json: {
				commandId: `${input.commandId}.upl`,
				contentDigest: digest,
				sizeBytes,
				mediaType: input.mediaType,
			},
			signal: input.signal,
		},
	);
	if (begun.status !== 201) return begun;
	const upload = (await begun.json()) as Schemas["SourceUpload"];
	const headers: Record<string, string> = {};
	for (const [k, v] of Object.entries(upload.uploadHeaders)) {
		// fetch sets the length from the body, which is exactly the signed one.
		if (k.toLowerCase() !== "content-length") headers[k] = String(v);
	}
	const put = await fetch(upload.uploadUrl, {
		method: upload.uploadMethod,
		headers,
		body: new Blob([new Uint8Array(input.bytes)]),
		signal: input.signal,
		redirect: "manual",
	});
	if (!put.ok) {
		return errorEnvelope(
			503,
			"DEPENDENCY_UNAVAILABLE",
			`The knowledge store answered ${put.status}.`,
			true,
		);
	}
	return platformFetch(config, "POST", "knowledge/sources", {
		json: {
			commandId: input.commandId,
			kind: "document",
			locator: `upload:${upload.uploadId}`,
			contentDigest: digest,
			mediaType: input.mediaType,
			sizeBytes,
			...(input.access?.length ? { access: input.access } : {}),
		},
		signal: input.signal,
	});
}

/**
 * Relays a platform response to the browser: status, the headers that matter
 * (including `Retry-After`, so a client waits what the API asked on a 429 or
 * 503 instead of guessing), the body stream.
 */
export function relay(response: Response): Response {
	const headers = new Headers({ "Cache-Control": "no-store" });
	for (const name of [
		"content-type",
		"retry-after",
		"anvilkit-source-lineage",
		"anvilkit-source-digest",
		"anvilkit-source-revision",
		"x-content-type-options",
	]) {
		const v = response.headers.get(name);
		if (v) headers.set(name, v);
	}
	return new Response(response.body, { status: response.status, headers });
}
