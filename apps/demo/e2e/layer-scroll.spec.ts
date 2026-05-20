/**
 * @file E2E — clicking a layer scrolls the canvas to that component.
 *
 * Exercises `LayerRow.select()` → `useScrollComponentIntoView()` in the
 * real demo editor. The demo seeds a tall Home page, so most seeded
 * components sit far below the canvas fold.
 *
 * Measurement note: Puck's canvas iframe (`iframe#preview-frame`) is
 * fixed-height and scrolls *internally* — its `scrollingElement`
 * scrolls, the iframe box does not resize and the parent window barely
 * moves. So "is the component visible to the user" must be measured
 * inside the iframe, against the iframe's own viewport height, not the
 * top-level page. Puck hardcodes the iframe id `preview-frame` and tags
 * every rendered component with `data-puck-component="<id>"` — the same
 * attribute the hook queries. Conventions match
 * `apps/demo/e2e/sidebar-modules.spec.ts`.
 */

import { type Frame, type Page, expect, test } from "@playwright/test";

const RAIL_TAB_LAYER = "ak-rail-tab-layer";
const MODULE_LAYER = "ak-module-layer";

async function gotoLayerModule(page: Page): Promise<void> {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.stack ?? err.message);
  });

  await page.goto("/puck/editor");
  await expect(
    page.locator('[role="tablist"][aria-orientation="vertical"]'),
  ).toBeVisible({ timeout: 30_000 });

  // The demo canvas animates continuously, so the rail tab never
  // settles to Playwright's "stable" actionability state. `force`
  // skips the stability wait — the assertions below are the real
  // verification.
  const railTab = page.locator(`#${RAIL_TAB_LAYER}`);
  await railTab.waitFor({ state: "attached", timeout: 30_000 });
  await railTab.click({ force: true });
  await expect(page.getByTestId(MODULE_LAYER)).toBeVisible({
    timeout: 10_000,
  });

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
}

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page
    .locator("iframe#preview-frame")
    .elementHandle({ timeout: 15_000 });
  expect(handle, "preview iframe handle").not.toBeNull();
  const frame = await handle?.contentFrame();
  expect(frame, "preview iframe contentFrame").not.toBeNull();
  return frame as Frame;
}

/** Is the component visible inside the canvas (iframe) viewport? */
function canvasState(
  frame: Frame,
  id: string,
): Promise<{ found: boolean; visible: boolean; scrollTop: number }> {
  return frame.evaluate((cid) => {
    const se = document.scrollingElement ?? document.documentElement;
    let el: Element | null = null;
    for (const e of document.querySelectorAll("[data-puck-component]")) {
      if (e.getAttribute("data-puck-component") === cid) {
        el = e;
        break;
      }
    }
    if (el === null) {
      return { found: false, visible: false, scrollTop: se.scrollTop };
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      found: true,
      visible: r.top < vh && r.bottom > 0,
      scrollTop: se.scrollTop,
    };
  }, id);
}

test("clicking a layer scrolls the canvas to the component", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoLayerModule(page);

  const tree = page.getByTestId("ak-layer-tree");
  await expect(tree).toBeVisible({ timeout: 10_000 });

  const ids = await page
    .locator('[data-testid^="ak-layer-node-"]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getAttribute("data-testid") ?? "")
        .map((tid) => tid.replace("ak-layer-node-", ""))
        .filter((id) => id.length > 0),
    );
  expect(ids.length, "seeded layer rows").toBeGreaterThan(0);

  const frame = await previewFrame(page);

  // Pick a layer whose component is rendered but NOT visible in the
  // canvas viewport at the current scroll position.
  let targetId: string | null = null;
  for (const id of ids) {
    const s = await canvasState(frame, id);
    if (s.found && !s.visible) {
      targetId = id;
      break;
    }
  }

  expect(
    targetId,
    "a seeded component below the canvas fold (page tall enough to scroll)",
  ).not.toBeNull();
  const id = targetId as string;

  const before = await canvasState(frame, id);
  expect(before.visible, "target off-screen in canvas before click").toBe(
    false,
  );

  await page.getByTestId(`ak-layer-select-${id}`).click({ force: true });

  // The hook calls scrollIntoView({ behavior: "smooth" }) — poll
  // while the animation settles. Assert both the user-visible
  // outcome (component in the canvas viewport) and that the canvas
  // actually scrolled.
  await expect
    .poll(async () => (await canvasState(frame, id)).visible, {
      timeout: 8_000,
      message: "clicked layer's component should scroll into the canvas",
    })
    .toBe(true);

  const after = await canvasState(frame, id);
  expect(after.scrollTop, "canvas iframe should have scrolled").toBeGreaterThan(
    before.scrollTop,
  );
});
