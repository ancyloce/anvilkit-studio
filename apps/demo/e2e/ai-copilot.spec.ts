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
	// Puck's embedded iframe causes intermittent layout shifts in the
	// outer page, which makes Playwright's default actionability check
	// flap. The button is always visible by the time hydration finishes,
	// so bypass the stability wait via force.
	await page
		.getByRole("button", { name: /^generate/i })
		.click({ force: true });

	// Hero fixture title: "Ship updates without friction." — see
	// packages/plugins/plugin-ai-copilot/src/mock/fixtures/hero.fixture.ts.
	// Poll both the main frame and any child frames; Puck may render
	// the preview inside its own iframe depending on its layout mode.
	await expect
		.poll(
			async () => {
				if (
					(await page.getByText(/ship updates without friction/i).count()) > 0
				) {
					return true;
				}
				for (const frame of page.frames()) {
					if (
						(await frame
							.getByText(/ship updates without friction/i)
							.count()) > 0
					) {
						return true;
					}
				}
				return false;
			},
			{ timeout: 10_000 },
		)
		.toBe(true);
});
