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
		...overrides,
	};
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
			content: [],
			zones: {},
		};
		// Typed via `typeof fetch` so `fetchMock.mock.calls[0]` is the
		// real `[input, init?]` tuple instead of an empty tuple. The
		// returned object only implements the three members the
		// adapter touches (`ok`, `status`, `json`) — casting through
		// `unknown` avoids pulling in a real DOM `Response`.
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					json: async () => newData,
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const getPuckApi = vi.fn(
			() =>
				({ dispatch }) as unknown as ReturnType<
					StudioPluginContext["getPuckApi"]
				>,
		);
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

	it("respects a custom apiPath override", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				({
					ok: true,
					status: 200,
					json: async () => ({
						root: { props: {} },
						content: [],
						zones: {},
					}),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const ctx = makeCtx({
			getPuckApi: (() => ({
				dispatch: vi.fn(),
			})) as unknown as StudioPluginContext["getPuckApi"],
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
					json: async () => ({}),
				}) as unknown as Response,
		);
		vi.stubGlobal("fetch", fetchMock);

		const dispatch = vi.fn();
		const log = vi.fn();
		const ctx = makeCtx({
			getPuckApi: (() => ({ dispatch })) as unknown as StudioPluginContext["getPuckApi"],
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
			getPuckApi: (() => ({ dispatch })) as unknown as StudioPluginContext["getPuckApi"],
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
