/**
 * Request-size cap on the Canvas Studio AI-image routes (task `cp5-R01`).
 *
 * The defect these tests pin down: `runImageRoute` used to `await req.json()`
 * on an unbounded body, so an oversized payload was fully buffered before any
 * validation could reject it. A cap applied *after* the parse would satisfy
 * the wording and miss the defect entirely — so the load-bearing test here is
 * "does not buffer an over-cap body", which meters how many bytes the
 * producer is actually asked for. Move the cap after `JSON.parse` and that
 * test goes red; the status-code tests alone would not.
 *
 * Nothing here reaches Replicate: over-cap requests return before the client
 * is constructed, and the under-cap cases use a `build` that returns a
 * `BAD_REQUEST` instead of a model call.
 */
import type { AiImageJobError } from "@anvilkit/canvas-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as bgRemovePost } from "../../bg-remove/route";
import { POST as inpaintPost } from "../../inpaint/route";
import { POST as textToImagePost } from "../../text-to-image/route";
import { POST as upscalePost } from "../../upscale/route";
import { POST as variationPost } from "../../variation/route";
import { MAX_REQUEST_BODY_BYTES, runImageRoute } from "../replicate";

const ROUTE_URL = "http://localhost/api/canvas/ai/bg-remove";
const CHUNK_BYTES = 64 * 1024;

type Build = Parameters<typeof runImageRoute>[1];

interface RouteErrorBody {
	error: { code: string; message: string };
}

/**
 * A `build` that records what it was handed and stops the lifecycle with a
 * `BAD_REQUEST`, so no test can reach the upstream. `seen.length === 0` is
 * the assertion that a rejected body never made it past the cap.
 */
function recordingBuild(): {
	build: Build;
	seen: Record<string, unknown>[];
} {
	const seen: Record<string, unknown>[] = [];
	return {
		seen,
		build: (body) => {
			seen.push(body);
			return { error: { code: "BAD_REQUEST", message: "build reached" } };
		},
	};
}

interface MeteredRequest {
	readonly req: Request;
	/** Bytes the producer has actually been asked to hand over. */
	produced(): number;
	cancelled(): boolean;
}

/**
 * A POST whose body is a lazily-produced stream, metered so a test can see
 * how much of it the handler pulled. `contentLength` is set explicitly
 * because undici puts no `content-length` on a streamed `Request` — which is
 * exactly the header-absent case the streamed guard exists for.
 */
function meteredRequest(
	totalBytes: number,
	options: { contentLength?: string; chunkBytes?: number } = {},
): MeteredRequest {
	const chunkBytes = options.chunkBytes ?? CHUNK_BYTES;
	let produced = 0;
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (produced >= totalBytes) {
				controller.close();
				return;
			}
			const size = Math.min(chunkBytes, totalBytes - produced);
			produced += size;
			controller.enqueue(new Uint8Array(size).fill(0x20));
		},
		cancel() {
			cancelled = true;
		},
	});
	const init = {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(options.contentLength === undefined
				? {}
				: { "content-length": options.contentLength }),
		},
		body: stream,
		// Node requires `duplex` for a streaming request body; it is absent
		// from lib.dom's `RequestInit`, hence the assertion.
		duplex: "half",
	} as RequestInit;
	return {
		req: new Request(ROUTE_URL, init),
		produced: () => produced,
		cancelled: () => cancelled,
	};
}

/** A POST whose JSON body arrives in `chunkBytes` slices, with no `content-length`. */
function chunkedJsonRequest(json: string, chunkBytes: number): Request {
	const bytes = new TextEncoder().encode(json);
	let offset = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= bytes.byteLength) {
				controller.close();
				return;
			}
			const end = Math.min(offset + chunkBytes, bytes.byteLength);
			controller.enqueue(bytes.slice(offset, end));
			offset = end;
		},
	});
	return new Request(ROUTE_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: stream,
		duplex: "half",
	} as RequestInit);
}

async function errorBodyOf(res: Response): Promise<RouteErrorBody> {
	return (await res.json()) as RouteErrorBody;
}

beforeEach(() => {
	// A token must be present or the 503 guard short-circuits ahead of the cap.
	// Stubbing also shields the suite from a real token in the dev environment.
	vi.stubEnv("REPLICATE_API_TOKEN", "test-token-not-a-real-key");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("runImageRoute request-size cap: Content-Length", () => {
	it("rejects a declared length over the cap before reading the body", async () => {
		const { build, seen } = recordingBuild();
		const metered = meteredRequest(MAX_REQUEST_BODY_BYTES * 2, {
			contentLength: String(MAX_REQUEST_BODY_BYTES + 1),
		});

		const res = await runImageRoute(metered.req, build);

		expect(res.status).toBe(413);
		expect((await errorBodyOf(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
		expect(seen).toHaveLength(0);
		// undici speculatively pulls a single chunk; nothing beyond that is read.
		expect(metered.produced()).toBeLessThanOrEqual(CHUNK_BYTES);
	});

	it("accepts a declared length at exactly the cap", async () => {
		const { build, seen } = recordingBuild();
		const body = JSON.stringify({
			sourceImageUrl: "https://example.test/a.png",
		});
		const res = await runImageRoute(
			new Request(ROUTE_URL, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": String(MAX_REQUEST_BODY_BYTES),
				},
				body,
			}),
			build,
		);

		expect(res.status).toBe(400);
		expect(seen).toHaveLength(1);
	});
});

describe("runImageRoute request-size cap: streamed read", () => {
	it("guards a body that omits Content-Length entirely", async () => {
		const { build, seen } = recordingBuild();
		const metered = meteredRequest(MAX_REQUEST_BODY_BYTES * 2);

		// The premise: a streamed body carries no length header, so the
		// header check cannot see this request at all.
		expect(metered.req.headers.get("content-length")).toBeNull();

		const res = await runImageRoute(metered.req, build);

		expect(res.status).toBe(413);
		expect((await errorBodyOf(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
		expect(seen).toHaveLength(0);
	});

	it("guards a body whose Content-Length understates its real size", async () => {
		const { build, seen } = recordingBuild();
		const metered = meteredRequest(MAX_REQUEST_BODY_BYTES * 2, {
			contentLength: "42",
		});

		const res = await runImageRoute(metered.req, build);

		expect(res.status).toBe(413);
		expect((await errorBodyOf(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
		expect(seen).toHaveLength(0);
	});

	it("does not buffer an over-cap body — the whole point of the cap", async () => {
		const { build, seen } = recordingBuild();
		const totalBytes = MAX_REQUEST_BODY_BYTES * 4;
		const metered = meteredRequest(totalBytes);

		const res = await runImageRoute(metered.req, build);

		expect(res.status).toBe(413);
		expect(seen).toHaveLength(0);
		// The handler stopped pulling once the running total crossed the cap:
		// the cap, plus the chunk that crossed it, plus undici's one-chunk
		// lookahead. Applying the cap after `req.json()` instead would pull
		// all `totalBytes` and fail this assertion.
		expect(metered.produced()).toBeLessThanOrEqual(
			MAX_REQUEST_BODY_BYTES + 2 * CHUNK_BYTES,
		);
		expect(metered.produced()).toBeLessThan(totalBytes / 2);
		expect(metered.cancelled()).toBe(true);
	});
});

describe("runImageRoute request-size cap: under-cap requests are unaffected", () => {
	it("hands a small JSON body to build unchanged", async () => {
		const { build, seen } = recordingBuild();
		const payload = {
			kind: "inpaint",
			sourceImageUrl: "https://example.test/source.png",
			maskImageUrl: "https://example.test/mask.png",
			prompt: "a red hat",
			seed: 7,
		};

		const res = await runImageRoute(
			new Request(ROUTE_URL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}),
			build,
		);

		expect(res.status).toBe(400);
		expect(seen).toEqual([payload]);
	});

	it("reassembles a chunked body split mid-character", async () => {
		const { build, seen } = recordingBuild();
		const payload = { prompt: "café 🎨 en été" };
		const res = await runImageRoute(
			// 3-byte slices cut the 4-byte emoji across chunk boundaries.
			chunkedJsonRequest(JSON.stringify(payload), 3),
			build,
		);

		expect(res.status).toBe(400);
		expect(seen).toEqual([payload]);
	});

	it("still answers 400 for an unparseable body", async () => {
		const { build, seen } = recordingBuild();
		const res = await runImageRoute(
			new Request(ROUTE_URL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{not json",
			}),
			build,
		);

		expect(res.status).toBe(400);
		expect((await errorBodyOf(res)).error.code).toBe("BAD_REQUEST");
		expect(seen).toHaveLength(0);
	});

	it("still answers 400 for a request with no body at all", async () => {
		const { build, seen } = recordingBuild();
		const res = await runImageRoute(
			new Request(ROUTE_URL, { method: "POST" }),
			build,
		);

		expect(res.status).toBe(400);
		expect(seen).toHaveLength(0);
	});
});

describe("runImageRoute request-size cap: error shape and ordering", () => {
	it("emits an AiImageJobError-compatible body the client already handles", async () => {
		const { build } = recordingBuild();
		const res = await runImageRoute(
			meteredRequest(MAX_REQUEST_BODY_BYTES * 2).req,
			build,
		);
		const body = await errorBodyOf(res);

		// This is exactly what `replicate-image-provider.ts` reads off a
		// non-ok response (`parsed?.error?.code` / `.message`) before handing
		// it to the job store as an `AiImageJobError`.
		const jobError: AiImageJobError = {
			code: body.error.code,
			message: body.error.message,
		};
		expect(jobError.code).toBe("PAYLOAD_TOO_LARGE");
		expect(jobError.message).toContain(String(MAX_REQUEST_BODY_BYTES));
		expect(res.headers.get("content-type")).toContain("application/json");
	});

	it("keeps the PROVIDER_DISABLED guard ahead of the cap", async () => {
		// Deliberate ordering, recorded for cp5-R04: an unconfigured server
		// answers 503 without reading the body at all, so the documented
		// "503 for every op when unconfigured" invariant (ADR 0009 Decision 3,
		// e2e/canvas-ai.spec.ts) is unchanged by this task.
		vi.stubEnv("REPLICATE_API_TOKEN", "");
		const { build, seen } = recordingBuild();
		const metered = meteredRequest(MAX_REQUEST_BODY_BYTES * 2);

		const res = await runImageRoute(metered.req, build);

		expect(res.status).toBe(503);
		expect((await errorBodyOf(res)).error.code).toBe("PROVIDER_DISABLED");
		expect(seen).toHaveLength(0);
		expect(metered.produced()).toBeLessThanOrEqual(CHUNK_BYTES);
	});
});

describe("every AI route inherits the cap through runImageRoute", () => {
	const routes = [
		["bg-remove", bgRemovePost],
		["text-to-image", textToImagePost],
		["inpaint", inpaintPost],
		["upscale", upscalePost],
		["variation", variationPost],
	] as const;

	for (const [name, post] of routes) {
		it(`${name} rejects an over-cap body with 413 PAYLOAD_TOO_LARGE`, async () => {
			const metered = meteredRequest(MAX_REQUEST_BODY_BYTES * 2);
			const res = await post(metered.req);

			expect(res.status).toBe(413);
			expect((await errorBodyOf(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
			expect(metered.produced()).toBeLessThan(MAX_REQUEST_BODY_BYTES * 2);
		});
	}

	it("covers every route directory under app/api/canvas/ai", async () => {
		// A route added later inherits the cap only if it goes through
		// `runImageRoute`. This fails when a new route directory appears
		// without a case above, which is the moment to check that it does.
		const { readdir } = await import("node:fs/promises");
		const here = new URL("../../", import.meta.url);
		const entries = await readdir(here, { withFileTypes: true });
		const routeDirs = entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("_"))
			.map((e) => e.name)
			.sort();

		expect(routeDirs).toEqual([...routes.map(([name]) => name)].sort());
	});
});
