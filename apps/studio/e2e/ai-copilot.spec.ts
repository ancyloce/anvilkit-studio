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

  // The AI copilot panel lives in the StudioSidebar's `copilot` module
  // (PRD §11). Open the AI Copilot rail tab before driving the prompt.
  await page.getByRole("tab", { name: "AI Copilot" }).click({ force: true });
  await expect(page.getByTestId("ai-prompt-panel-input")).toBeVisible();

  await page.getByLabel(/prompt/i).fill("a hero for a SaaS landing page");
  // Puck's embedded iframe causes intermittent layout shifts in the
  // outer page, which makes Playwright's default actionability check
  // flap. The button is always visible by the time hydration finishes,
  // so bypass the stability wait via force.
  await page.getByRole("button", { name: /^generate/i }).click({ force: true });

  // Hero fixture title: "Ship updates without friction." — see
  // packages/extensions/plugins/plugin-ai-copilot/src/mock/fixtures/hero.fixture.ts.
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
            (await frame.getByText(/ship updates without friction/i).count()) >
            0
          ) {
            return true;
          }
        }
        return false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  // Regression guard: the AI Copilot panel must own the StudioSidebar
  // `copilot` slot for the whole session. `copilotPanel` is a
  // single-occupancy surface (core's sidebar registry is last-write-wins),
  // so a second registrant co-mounted in this <Studio> — e.g. the AI Image
  // sidebar plugin, whose home is the canvas-studio route — would clobber it
  // and emit the overwrite warning. Assert that warning never fired.
  expect(
    consoleMessages.filter((line) =>
      line.includes('"copilotPanel" surface is already registered'),
    ),
  ).toEqual([]);
});
