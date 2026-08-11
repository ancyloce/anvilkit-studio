import { expect, test } from "@playwright/test";

/** AI-image ops exposed by the Canvas Studio routes (task I1-11). */
const AI_OPS = [
	"text-to-image",
	"variation",
	"inpaint",
	"bg-remove",
	"upscale",
] as const;

test.describe("Canvas Studio AI image", () => {
	// Without REPLICATE_API_TOKEN the server-side guard short-circuits before
	// any model call, so every route answers 503 PROVIDER_DISABLED. CI runs
	// without the token; skip when a real provider is configured locally.
	test.describe("routes (no token)", () => {
		test.skip(
			!!process.env.REPLICATE_API_TOKEN,
			"real Replicate provider configured — route guard would not 503",
		);

		for (const op of AI_OPS) {
			test(`POST /api/canvas/ai/${op} → 503 PROVIDER_DISABLED`, async ({
				request,
			}) => {
				const res = await request.post(`/api/canvas/ai/${op}`, { data: {} });
				expect(res.status()).toBe(503);
				const body = (await res.json()) as {
					error?: { code?: string };
				};
				expect(body.error?.code).toBe("PROVIDER_DISABLED");
			});
		}
	});

	// PLAN-0035 `cp5-R02` — the UI half of the same invariant the route-guard
	// suite above asserts on the server. Those tests prove the *route* refuses
	// to spend money without a token; this proves the *browser* never asks it
	// to, and that the absence of a token is a graceful degradation to the mock
	// rather than an error state. The two halves are deliberately not
	// duplicated: nothing here re-asserts a 503.
	test("mock provider: upscale surfaces a result asset, and the UI reaches no paid provider", async ({
		page,
	}) => {
		// Unique page id per CLAUDE.md test-infra guidance.
		const pageId = `e2e-ai-${Date.now()}`;

		// Every request the page makes, recorded before the first navigation so
		// nothing escapes the net. Two classes matter:
		//   - `/api/canvas/ai/*` — the demo's own route. With the mock selected
		//     (NEXT_PUBLIC_AI_IMAGE_REAL unset, which is how CI runs), the
		//     client must never reach it at all.
		//   - any Replicate host — a direct browser call would bill the operator
		//     and would mean the token had reached the client.
		const aiRouteRequests: string[] = [];
		const upstreamRequests: string[] = [];
		page.on("request", (req) => {
			const url = req.url();
			if (url.includes("/api/canvas/ai/")) aiRouteRequests.push(url);
			if (/replicate\.(com|delivery)/.test(url)) upstreamRequests.push(url);
		});

		// "Degrades rather than errors" means the mount survives: an unhandled
		// exception in the AI wiring would surface here, not as inline UI.
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => pageErrors.push(err.message));

		await page.goto(`/studio/canvas/${pageId}`);

		await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("ak-module-ai-image")).toBeVisible();

		// With no NEXT_PUBLIC_AI_IMAGE_REAL the demo uses the deterministic mock
		// provider, so this runs offline with no Replicate token.
		await page.getByTestId("ai-image-op-upscale").click();
		await page.getByTestId("ai-image-source").fill("demo-source");

		const run = page.getByTestId("ai-image-run");
		await expect(run).toBeEnabled();
		await run.click();

		await expect(page.getByTestId("ai-image-result")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("ai-image-error")).toHaveCount(0);

		// The zero-cost default, asserted rather than assumed (ADR 0009
		// "Key custody" — the mock is the default so CI never calls a paid API).
		expect(aiRouteRequests).toEqual([]);
		expect(upstreamRequests).toEqual([]);
		expect(pageErrors).toEqual([]);
	});

	// Same unconfigured server the route-guard suite exercises, seen from the
	// UI: an operator with no token still gets a working panel. If the demo ever
	// starts hard-failing the surface when the provider is unconfigured, this
	// goes red.
	test("no token configured: the AI panel is operable, not an error state", async ({
		page,
	}) => {
		const pageId = `e2e-ai-degrade-${Date.now()}`;
		await page.goto(`/studio/canvas/${pageId}`);

		await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
			timeout: 30_000,
		});
		const panel = page.getByTestId("ak-module-ai-image");
		await expect(panel).toBeVisible();

		// Affordances render and are usable; nothing is disabled or errored out
		// on account of the missing server token.
		await expect(page.getByTestId("ai-image-op-list")).toBeVisible();
		await page.getByTestId("ai-image-op-text-to-image").click();
		await page.getByTestId("ai-image-prompt").fill("a calm harbour at dawn");
		await expect(page.getByTestId("ai-image-run")).toBeEnabled();
		await expect(page.getByTestId("ai-image-error")).toHaveCount(0);

		// NOTE for `cp5-R04` (ADR 0009 follow-up F-5): the panel advertises every
		// op in `OP_ORDER` because `apps/studio` supplies no
		// `AiProviderCapabilities`, while only five routes exist. That gap is a
		// contract question, not a leak, so it is recorded here rather than
		// asserted — pinning today's op count would freeze the defect.
	});
});
