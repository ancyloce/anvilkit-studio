import { expect, test } from "@playwright/test";

test("AI copilot generates a Hero from a matching fixture prompt", async ({
	page,
}) => {
	const consoleMessages: string[] = [];
	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});

	await page.goto("/puck/editor");

	// Wait for Studio to hydrate and fire smoke onInit (proves the
	// plugin pipeline is alive before we drive the UI).
	await expect
		.poll(
			() => consoleMessages.some((line) => line.includes("[smoke] onInit")),
			{ timeout: 15_000 },
		)
		.toBe(true);

	await page.getByLabel(/prompt/i).fill("a hero for a SaaS landing page");
	await page.getByRole("button", { name: /generate$/i }).click();

	// Hero fixture title: "Ship updates without friction." — see
	// packages/plugins/plugin-ai-copilot/src/mock/fixtures/hero.fixture.ts
	await expect(
		page.getByText(/ship updates without friction/i).first(),
	).toBeVisible({
		timeout: 10_000,
	});
});
