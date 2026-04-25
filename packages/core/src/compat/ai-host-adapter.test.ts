/**
 * @file Tests for the legacy `aiHost` → `StudioPlugin` compatibility
 * adapter (`core-010`).
 *
 * The adapter has two interesting behaviors that drive the test
 * structure:
 *
 * 1. **One-shot deprecation warning** — guarded by a module-scoped
 *    `let warned = false`. To exercise both the "first call warns" and
 *    "subsequent calls are silent" paths in isolation, every test that
 *    cares about the warning calls `vi.resetModules()` and re-imports
 *    the module dynamically. That gives each scenario a fresh
 *    `warned` flag without leaking state between tests.
 *
 * 2. **`onClick` performs a real `fetch`** — stubbed via
 *    `vi.stubGlobal("fetch", …)` so the request body, headers, and URL
 *    can be asserted directly. The shell would normally invoke
 *    `onClick` from React, but here we drive it from the test with a
 *    handcrafted `StudioPluginContext`.
 *
 * The acceptance criteria mirrored from `docs/tasks/core-010-compat-
 * ai-host.md`:
 *
 * - `isStudioPlugin(aiHostAdapter({ aiHost: "x" }))` is `true`.
 * - `compilePlugins([adapter], ctx)` resolves into a runtime that
 *   carries the `compat-ai-generate` header action.
 * - The deprecation warning fires exactly once per process.
 * - Mocked `fetch` receives a POST to `${aiHost}/generate` carrying
 *   `{ currentData: ctx.getData() }` as JSON.
 * - The response body is dispatched as `{ type: "setData", data }`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioConfigSchema } from "../config/schema.js";
import { compilePlugins } from "../runtime/compile-plugins.js";
import { isStudioPlugin } from "../runtime/detect-plugin.js";
import type { StudioPluginContext } from "../types/plugin.js";

const studioConfig = StudioConfigSchema.parse({});

/**
 * Build a synthetic {@link StudioPluginContext} for tests. The
 * compile-time path never invokes `getPuckApi()`, so it throws by
 * default; tests that drive `onClick` swap in a real Vitest mock.
 */
function makeCtx(
	overrides: Partial<StudioPluginContext> = {},
): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: (() => {
			throw new Error("getPuckApi should not be invoked in this test");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
		...overrides,
	};
}

function makePuckApi(
	dispatch: (action: unknown) => void = vi.fn(),
	componentNames: readonly string[] = [],
): ReturnType<StudioPluginContext["getPuckApi"]> {
	const components: Record<string, unknown> = {};
	for (const name of componentNames) {
		components[name] = {};
	}
	return {
		config: { components },
		dispatch,
	} as unknown as ReturnType<StudioPluginContext["getPuckApi"]>;
}

describe("aiHostAdapter — plugin shape", () => {
	it("returns an object that isStudioPlugin recognizes", async () => {
		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });

		expect(isStudioPlugin(plugin)).toBe(true);
		expect(plugin.meta.id).toBe("anvilkit-compat-ai-host");
		expect(plugin.meta.coreVersion).toBe("^0.1.0-alpha");
	});

	it("compiles cleanly through compilePlugins()", async () => {
		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const runtime = await compilePlugins(
			[aiHostAdapter({ aiHost: "https://ai.example.com" })],
			makeCtx(),
		);

		expect(runtime.pluginMeta.map((meta) => meta.id)).toEqual([
			"anvilkit-compat-ai-host",
		]);
		// The header action carrying the `compat-ai-generate` id should
		// land in the runtime's flat `headerActions` list — the
		// `composeHeaderActions()` step happens later in the shell.
		const ids = runtime.headerActions.map((action) => action.id);
		expect(ids).toContain("compat-ai-generate");
	});
});

describe("aiHostAdapter — deprecation warning", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Re-arm the module-scoped `warned` flag for each test by
		// forcing a fresh import. Without this, the first test in the
		// file would leave the flag tripped and every subsequent test
		// would observe zero warnings.
		vi.resetModules();
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
			/* swallow during tests */
		});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("fires exactly once even when the adapter is constructed many times", async () => {
		const { aiHostAdapter } = await import("./ai-host-adapter.js");

		aiHostAdapter({ aiHost: "https://ai.example.com" });
		aiHostAdapter({ aiHost: "https://ai.example.com" });
		aiHostAdapter({ aiHost: "https://other.example.com" });

		expect(warnSpy).toHaveBeenCalledTimes(1);
		const message = String(warnSpy.mock.calls[0]?.[0]);
		expect(message).toContain("@anvilkit/core");
		expect(message).toContain("aiHost");
		expect(message).toContain("createAiGenerationPlugin");
	});

	it("re-arms after vi.resetModules() so each test sees a clean slate", async () => {
		// First module instance: one warning.
		const first = await import("./ai-host-adapter.js");
		first.aiHostAdapter({ aiHost: "https://ai.example.com" });
		expect(warnSpy).toHaveBeenCalledTimes(1);

		// Reset the module graph and re-import — the new instance has
		// its own `warned` flag, so the next call should fire again.
		vi.resetModules();
		const second = await import("./ai-host-adapter.js");
		second.aiHostAdapter({ aiHost: "https://ai.example.com" });
		expect(warnSpy).toHaveBeenCalledTimes(2);
	});
});

describe("aiHostAdapter — onClick wiring", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Suppress the deprecation warning so test output stays clean.
		// `resetModules` keeps each test independent of the shared
		// `warned` flag — the assertions here do not care about it.
		vi.resetModules();
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
			/* silence */
		});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("POSTs the current Puck data to ${aiHost}/generate and dispatches the response", async () => {
		const newData = {
			root: { props: { title: "From AI" } },
			content: [{ type: "Hero", props: { title: "Generated" } }],
			zones: {
				sidebar: [{ type: "Hero", props: { title: "Nested" } }],
			},
		};
		// Typed via `typeof fetch` so `fetchMock.mock.calls[0]` is the
		// real `[input, init?]` tuple instead of an empty tuple. The
		// returned object only implements the members the adapter
		// touches (`ok`, `status`, `headers`, `text`) — casting
		// through `unknown` avoids pulling in a real DOM `Response`.
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					headers: new Headers({ "content-length": "100" }),
					text: async () => JSON.stringify(newData),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const getPuckApi = vi.fn(() => makePuckApi(dispatch, ["Hero"]));
		const currentData = {
			root: { props: { title: "Before" } },
			content: [],
			zones: {},
		};

		const ctx = makeCtx({
			getData: () => currentData,
			getPuckApi,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		const action = registration.headerActions?.[0];
		expect(action?.id).toBe("compat-ai-generate");

		await action?.onClick(ctx);

		// One fetch call to the default endpoint.
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://ai.example.com/generate");
		expect(init?.method).toBe("POST");
		expect(init?.headers).toEqual({ "Content-Type": "application/json" });
		expect(JSON.parse(String(init?.body))).toEqual({ currentData });

		// And the response is dispatched as `setData`.
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({ type: "setData", data: newData });
	});

	it("refuses responses that reference component types missing from Puck config", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					headers: new Headers(),
					text: async () =>
						JSON.stringify({
							root: { props: {} },
							content: [{ type: "ScriptInjector", props: {} }],
							zones: {},
						}),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch, ["Hero"])) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("registered component types"),
			expect.objectContaining({ endpoint: "https://ai.example.com/generate" }),
		);
	});

	it("respects a custom apiPath override", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					headers: new Headers(),
					text: async () =>
						JSON.stringify({
							root: { props: {} },
							content: [],
							zones: {},
						}),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(vi.fn())) as StudioPluginContext["getPuckApi"],
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({
			aiHost: "https://ai.example.com",
			apiPath: "/v2/ai/run",
		});
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://ai.example.com/v2/ai/run",
			expect.any(Object),
		);
	});

	it("logs and swallows non-2xx responses without dispatching", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: false,
					status: 500,
					headers: new Headers(),
					text: async () => "{}",
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("500"),
			expect.objectContaining({ status: 500 }),
		);
	});

	it("logs and swallows fetch rejections without throwing", async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => {
			throw new Error("network down");
		});
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);

		// Must not reject — the adapter is responsible for swallowing
		// the failure so a transient network error never crashes the
		// editor.
		await expect(
			registration.headerActions?.[0]?.onClick(ctx),
		).resolves.toBeUndefined();

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("aiHost"),
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});
});

// ----------------------------------------------------------------------
// Response size cap (F2 in docs/code-review/packages-core-review.md).
//
// `Content-Length` is advisory — a hostile or HTTP/2 endpoint may omit
// it or under-report. The bounded streaming reader is the load-bearing
// enforcement; these tests pin the boundary at exactly 1 MiB and
// confirm the cap holds regardless of whether `Content-Length` is
// present, accurate, or missing.
// ----------------------------------------------------------------------

describe("aiHostAdapter — response size cap", () => {
	const MAX_RESPONSE_BYTES = 1_048_576;

	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	/**
	 * Build a streaming Response stand-in. The single chunk's byte
	 * length controls whether the bounded reader trips the cap; the
	 * `headers` shape mirrors what we'd see if the endpoint either
	 * declared an honest length or omitted it entirely.
	 */
	function makeStreamedResponse(
		bodyBytes: Uint8Array,
		options: { contentLength?: string | null; ok?: boolean } = {},
	): Response {
		const { contentLength = null, ok = true } = options;
		const headers = new Headers();
		if (contentLength !== null) {
			headers.set("content-length", contentLength);
		}
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bodyBytes);
				controller.close();
			},
		});
		return {
			ok,
			status: ok ? 200 : 500,
			headers,
			body: stream,
			text: async () => new TextDecoder().decode(bodyBytes),
		} as unknown as Response;
	}

	function asciiPayload(byteCount: number): Uint8Array {
		// `"a"` is one UTF-8 byte, so a string of length N has a
		// stream-byte size of exactly N. Used to drive the cap to
		// precise boundary values.
		return new TextEncoder().encode("a".repeat(byteCount));
	}

	it("dispatches a response that is exactly 1 MiB - 1 (cap NOT crossed)", async () => {
		// Build a valid JSON payload that totals MAX - 1 bytes by
		// padding the title with ASCII filler. The padding length
		// accounts for the JSON envelope overhead.
		const envelope = {
			root: { props: { title: "" } },
			content: [],
			zones: {},
		};
		const overhead = JSON.stringify(envelope).length;
		const padding = "a".repeat(MAX_RESPONSE_BYTES - 1 - overhead);
		const validData = {
			root: { props: { title: padding } },
			content: [],
			zones: {},
		};
		const bodyBytes = new TextEncoder().encode(JSON.stringify(validData));
		expect(bodyBytes.byteLength).toBe(MAX_RESPONSE_BYTES - 1);

		const fetchMock = vi.fn<typeof fetch>(async () =>
			makeStreamedResponse(bodyBytes),
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).toHaveBeenCalledTimes(1);
	});

	it("rejects a response that is exactly 1 MiB + 1 (cap crossed) when Content-Length is missing", async () => {
		const bodyBytes = asciiPayload(MAX_RESPONSE_BYTES + 1);

		const fetchMock = vi.fn<typeof fetch>(async () =>
			makeStreamedResponse(bodyBytes, { contentLength: null }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("size limit"),
			expect.objectContaining({
				bytesRead: expect.any(Number),
				limit: MAX_RESPONSE_BYTES,
			}),
		);
	});

	it("rejects a response whose Content-Length lies and the body is oversized", async () => {
		// Endpoint declares a tiny length but ships a multi-MiB body.
		// The early-reject fast-path is bypassed; the streaming reader
		// is the only thing standing between the editor and an OOM.
		const bodyBytes = asciiPayload(MAX_RESPONSE_BYTES + 1024);

		const fetchMock = vi.fn<typeof fetch>(async () =>
			makeStreamedResponse(bodyBytes, { contentLength: "100" }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("size limit"),
			expect.any(Object),
		);
	});

	it("rejects an oversize non-ASCII fallback body (no `response.body` stream)", async () => {
		// The fallback path runs when `response.body` is missing (some
		// mocks, some intermediaries). UTF-16 `string.length` would
		// under-count multi-byte codepoints — a payload composed of
		// 3-byte CJK glyphs or 4-byte emoji can be twice the byte size
		// of its UTF-16 length. Without UTF-8 byte counting, such a
		// payload sneaks past the cap. This test pins the
		// byte-accurate enforcement.
		//
		// Each `"😀"` is 2 UTF-16 code units and 4 UTF-8 bytes. We
		// repeat enough times that the byte size exceeds the 1 MiB cap
		// while the UTF-16 length is comfortably under it.
		const emoji = "😀";
		const repetitions = Math.ceil((MAX_RESPONSE_BYTES + 1024) / 4);
		const oversizedText = emoji.repeat(repetitions);
		// Sanity-check the test fixture itself — UTF-16 length is well
		// under the cap, but UTF-8 byte length crosses it.
		expect(oversizedText.length).toBeLessThan(MAX_RESPONSE_BYTES);
		expect(new TextEncoder().encode(oversizedText).byteLength).toBeGreaterThan(
			MAX_RESPONSE_BYTES,
		);

		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					headers: new Headers(),
					// No `body` → triggers the fallback path. `text()`
					// returns the oversize string verbatim.
					text: async () => oversizedText,
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(dispatch)) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(dispatch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("size limit"),
			expect.objectContaining({
				bytesRead: expect.any(Number),
				limit: MAX_RESPONSE_BYTES,
			}),
		);
	});

	it("early-rejects when Content-Length declares more than the cap (fast path)", async () => {
		// The fast path saves us a round-trip through the streaming
		// reader for honest oversize responses. We give it a small
		// body so we can prove it never reached the reader: if the
		// fast path failed, the reader would still complete and the
		// "bytesRead" key would appear in the log meta.
		const bodyBytes = new TextEncoder().encode("{}");
		const fetchMock = vi.fn<typeof fetch>(async () =>
			makeStreamedResponse(bodyBytes, {
				contentLength: String(MAX_RESPONSE_BYTES + 1),
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() =>
				makePuckApi(vi.fn())) as StudioPluginContext["getPuckApi"],
			log,
		});

		const { aiHostAdapter } = await import("./ai-host-adapter.js");
		const plugin = aiHostAdapter({ aiHost: "https://ai.example.com" });
		const registration = await plugin.register(ctx);
		await registration.headerActions?.[0]?.onClick(ctx);

		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("size limit"),
			expect.objectContaining({ contentLength: expect.any(String) }),
		);
	});
});
