/**
 * PLAN-0035 `cp5-R02` — the env gate around the paid AI provider is an
 * *assertion*, not a convention.
 *
 * Two properties are protected here, both of which were designed correctly and
 * neither of which was previously tested (ADR 0009 §"Key custody"):
 *
 *  1. **Mock by default.** With `NEXT_PUBLIC_AI_IMAGE_REAL` unset, the demo
 *     selects the deterministic mock provider and reaches no network at all —
 *     which is why a bare checkout, CI, and every E2E run cost nothing.
 *  2. **Degrade, don't error.** With the flag set but no server token, every
 *     route answers 503 `PROVIDER_DISABLED`
 *     (`app/api/canvas/ai/_lib/replicate.ts` `runImageRoute`), and the client
 *     turns that into a terminal `status: "error"` job result. It must **not**
 *     throw: `AiImagePanel` renders a terminal error result into its
 *     `ai-image-error` alert, whereas a rejection would surface as an unhandled
 *     error in the mount. That distinction *is* "the UI degrades rather than
 *     erroring", asserted at the exact seam the panel consumes.
 *
 * Inverting the gate fails this file in **both** directions: forcing the real
 * provider breaks "mock by default" (a fetch happens), and forcing the mock
 * breaks "the flag selects the real provider" (no fetch happens).
 *
 * NO PAID NETWORK CALL IS POSSIBLE HERE, by two independent mechanisms:
 * `fetchImpl` is injected into the provider, and `globalThis.fetch` is replaced
 * for the duration of the suite with a function that throws — so a future
 * refactor that bypasses the injected fetch fails loudly instead of dialling
 * out. Nothing in this file carries a credential.
 */
import type { AiImageJobResult, AiLayerContext } from "@anvilkit/canvas-core";
import { createAiJobClient } from "@anvilkit/plugin-ai-image";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only: couples this test to the route's error contract at compile time
// without importing the server module (and its `replicate` SDK) at runtime.
import type { AiRouteErrorBody } from "../../../app/api/canvas/ai/_lib/replicate";
import {
	isRealAiImageEnabled,
	selectAiImageProvider,
} from "../provider-selection";

/** The exact body `runImageRoute` returns when `REPLICATE_API_TOKEN` is unset. */
const PROVIDER_DISABLED_BODY: AiRouteErrorBody = {
	error: {
		code: "PROVIDER_DISABLED",
		message:
			"REPLICATE_API_TOKEN is not configured on the server. Set it (and NEXT_PUBLIC_AI_IMAGE_REAL=1) to enable the real provider; the demo uses the mock provider otherwise.",
	},
};

const CONTEXT: AiLayerContext = { artboardId: "artboard-1" };

/** A `bg-remove` job whose source asset resolves, so nothing short-circuits. */
const REQUEST = { kind: "bg-remove", sourceAssetId: "asset-1" } as const;

/**
 * Stands in for the unconfigured server: answers every AI route with the real
 * 503 body and records the calls, so a test can assert whether the client ever
 * tried to reach the route at all.
 */
function createRouteStub() {
	const calls: string[] = [];
	const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
		calls.push(String(input));
		return new Response(JSON.stringify(PROVIDER_DISABLED_BODY), {
			status: 503,
			headers: { "content-type": "application/json" },
		});
	});
	return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function providerOptions(fetchImpl: typeof fetch) {
	return {
		getAssetUrl: (assetId: string) => `blob:asset/${assetId}`,
		upload: async () => ({ id: "should-never-be-reached" }),
		fetchImpl,
	};
}

/** Drives the provider through the same `AiJobClient` the real mount builds. */
async function runJob(
	fetchImpl: typeof fetch,
	signal?: AbortSignal,
): Promise<AiImageJobResult> {
	const provider = selectAiImageProvider(providerOptions(fetchImpl));
	const client = createAiJobClient({ provider });
	return client.run(REQUEST, CONTEXT, signal ? { signal } : undefined);
}

let realFetch: typeof globalThis.fetch;

beforeEach(() => {
	realFetch = globalThis.fetch;
	// Belt-and-braces: no test in this file may reach the network. If a future
	// refactor stops honouring `fetchImpl`, this throws instead of billing.
	globalThis.fetch = (() => {
		throw new Error(
			"provider-selection.test.ts: globalThis.fetch was called. No test here may perform a network call.",
		);
	}) as unknown as typeof fetch;
	vi.unstubAllEnvs();
});

afterEach(() => {
	globalThis.fetch = realFetch;
	vi.unstubAllEnvs();
});

describe("isRealAiImageEnabled", () => {
	it("is false when NEXT_PUBLIC_AI_IMAGE_REAL is unset", () => {
		vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", undefined);
		expect(isRealAiImageEnabled()).toBe(false);
	});

	it.each(["", "0", "true", "yes", "TRUE", "2"])(
		'is false for the non-"1" value %j',
		(value) => {
			vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", value);
			expect(isRealAiImageEnabled()).toBe(false);
		},
	);

	it('is true only for exactly "1"', () => {
		vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", "1");
		expect(isRealAiImageEnabled()).toBe(true);
	});
});

describe("selectAiImageProvider — mock is the default (zero-cost, offline)", () => {
	it("returns the mock provider and performs no request when the flag is unset", async () => {
		vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", undefined);
		const { calls, fetchImpl } = createRouteStub();

		const result = await runJob(fetchImpl);

		// The mock resolves deterministically to a `mock-asset-*` id...
		expect(result.status).toBe("complete");
		expect(
			result.status === "complete" ? result.resultAssetId : undefined,
		).toMatch(/^mock-asset-bg-remove-/);
		// ...and — the property that keeps CI free — never calls the route.
		expect(calls).toEqual([]);
	});
});

describe("selectAiImageProvider — the flag selects the real provider", () => {
	it('routes the job to /api/canvas/ai/<kind> when the flag is exactly "1"', async () => {
		vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", "1");
		const { calls, fetchImpl } = createRouteStub();

		await runJob(fetchImpl);

		expect(calls).toEqual(["/api/canvas/ai/bg-remove"]);
	});

	it("degrades to a terminal PROVIDER_DISABLED result — it does not throw — when the server has no token", async () => {
		vi.stubEnv("NEXT_PUBLIC_AI_IMAGE_REAL", "1");
		const { fetchImpl } = createRouteStub();

		const result = await runJob(fetchImpl);

		expect(result.status).toBe("error");
		// A terminal error result is what `AiImagePanel` renders into its
		// `ai-image-error` alert; a rejection would break the mount instead.
		expect(result.status === "error" ? result.error.code : undefined).toBe(
			"PROVIDER_DISABLED",
		);
		expect(result.status === "error" ? result.error.message : "").toContain(
			"REPLICATE_API_TOKEN is not configured",
		);
	});
});
