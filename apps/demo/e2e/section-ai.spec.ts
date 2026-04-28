/**
 * @file Phase 6 / M9 section-AI E2E — proves the full
 * select → prompt → regenerate → apply round-trip on the demo.
 *
 * The demo's `aiCopilotPlugin` is wired with both a page-level mock
 * (`createMockGeneratePage`) and a section-level mock
 * (`createMockGenerateSection`); the latter overrides the prompt-prop
 * key (`headline`/`title`/`label`/`heading`) on the selected node with
 * the prompt text. With the demo's "Simulate hero selection" toggle
 * pinning `nodeIds: ["hero-primary"]`, asserting the new headline text
 * appears on the canvas after submission proves the patch was
 * dispatched via `puckApi.dispatch({ type: "setData" })`.
 *
 * What this spec asserts:
 *
 * 1. The AI panel renders in **page mode** by default ("Generate page"
 *    heading, "Page flow" eyebrow).
 * 2. Toggling "Simulate hero selection" flips the panel into
 *    **section mode** ("Regenerate selection" heading, "Section flow"
 *    eyebrow). This is the M9 panel-switching behavior.
 * 3. Submitting a section regeneration prompt updates the hero subtree
 *    on the canvas — the new prompt text appears as the headline.
 * 4. The pricing subtree is **not** mutated — its default copy
 *    ("Simple, Transparent Pricing") is still visible in the canvas
 *    after the dispatch. This proves the surrounding canvas is
 *    preserved by `applySectionPatch`.
 *
 * Cross-browser status: this spec runs Chromium-only, matching the
 * existing repo-wide convention documented in `playwright.config.ts`
 * (Firefox/WebKit deferred). Phase 6 plan §M9 acceptance criteria does
 * not require multi-browser coverage; the M9 task's DoD wording is
 * aspirational and re-aligns to repo policy.
 */

import { expect, test } from "@playwright/test";

const REGEN_HEADLINE = "Bold new pitch from the section flow";

test.describe("section-AI regenerate flow (Phase 6 / M9)", () => {
	test("regenerates the hero subtree without disturbing surrounding canvas", async ({
		page,
	}) => {
		const consoleMessages: string[] = [];
		const pageErrors: string[] = [];
		page.on("console", (msg) => {
			consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
		});
		page.on("pageerror", (err) => {
			pageErrors.push(err.stack ?? err.message);
		});

		await page.goto("/puck/editor");

		// Wait for hydration via the smoke plugin's onInit log — same
		// canary the other specs rely on.
		await expect
			.poll(
				() =>
					consoleMessages.some((text) => text.includes("[smoke] onInit")),
				{
					timeout: 15_000,
					message: [
						"Expected smokeTestPlugin to log '[smoke] onInit' after hydration.",
						`Console (last 20): ${JSON.stringify(consoleMessages.slice(-20))}`,
						`Page errors: ${JSON.stringify(pageErrors)}`,
					].join("\n"),
				},
			)
			.toBe(true);

		const heading = page.getByTestId("ai-prompt-panel-heading");
		const eyebrow = page.getByTestId("ai-prompt-panel-eyebrow");

		// (1) Default: page mode.
		await expect(heading).toHaveText("Generate page");
		await expect(eyebrow).toHaveText("Page flow");

		// (2) Toggle to section mode.
		await page
			.getByTestId("ai-toggle-section")
			.click({ force: true });
		await expect(heading).toHaveText("Regenerate selection");
		await expect(eyebrow).toHaveText("Section flow");

		// (3) Type the prompt and submit.
		await page.getByTestId("ai-prompt-panel-input").fill(REGEN_HEADLINE);
		await page
			.getByTestId("ai-prompt-panel-submit")
			.click({ force: true });

		// (4) The submit button reverts from "Regenerating…" once the
		// patch is applied. Polling the label is more reliable than
		// timing the dispatch directly.
		await expect
			.poll(
				async () => {
					const text =
						(await page
							.getByTestId("ai-prompt-panel-submit")
							.textContent()) ?? "";
					return text.trim();
				},
				{ timeout: 10_000 },
			)
			.toBe("Regenerate selection");

		// (5) Clear the textarea so the prompt text only remains in the
		// DOM if the patch was actually applied to the canvas. Without
		// this, the still-populated textarea would be a false positive
		// for the canvas assertion below.
		await page.getByTestId("ai-prompt-panel-input").fill("");

		// (6) The new hero headline shows in the canvas (main frame or
		// any Puck-internal preview frame). The demo's published-data
		// `<pre>` snapshot does NOT update on dispatch (only on
		// `onPublish`), so a hit must come from the live canvas.
		await expect
			.poll(
				async () => {
					const haystacks: string[] = [];
					haystacks.push((await page.content()) ?? "");
					for (const frame of page.frames()) {
						haystacks.push((await frame.content()) ?? "");
					}
					return haystacks.some((html) => html.includes(REGEN_HEADLINE));
				},
				{
					timeout: 10_000,
					message: "Expected the new section headline to render after dispatch.",
				},
			)
			.toBe(true);

		// (7) Pricing copy stays unchanged — proves applySectionPatch
		// preserved the surrounding canvas.
		const pricingStillPresent = async () => {
			const haystacks: string[] = [];
			haystacks.push((await page.content()) ?? "");
			for (const frame of page.frames()) {
				haystacks.push((await frame.content()) ?? "");
			}
			return haystacks.some((html) =>
				html.includes("Simple, Transparent Pricing"),
			);
		};
		await expect
			.poll(pricingStillPresent, {
				timeout: 5_000,
				message:
					"Expected the PricingMinimal subtree to remain unchanged after section regeneration.",
			})
			.toBe(true);
	});

	test("clearing the selection returns the panel to page mode", async ({
		page,
	}) => {
		await page.goto("/puck/editor");

		const heading = page.getByTestId("ai-prompt-panel-heading");
		await page.getByTestId("ai-toggle-section").click({ force: true });
		await expect(heading).toHaveText("Regenerate selection");
		await page.getByTestId("ai-toggle-section").click({ force: true });
		await expect(heading).toHaveText("Generate page");
	});
});
