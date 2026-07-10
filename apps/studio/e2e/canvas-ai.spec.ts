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

	test("mock provider: upscale surfaces a result asset", async ({ page }) => {
		// Unique page id per CLAUDE.md test-infra guidance.
		const pageId = `e2e-ai-${Date.now()}`;
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
	});
});
