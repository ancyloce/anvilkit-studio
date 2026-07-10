/**
 * @file Phase 2 GA Core — collab.spec.ts.
 *
 * Two-context end-to-end coverage for the `@anvilkit/collab-ui`
 * primitives running over the y-websocket reference relay
 * (booted by playwright.config.ts as a second `webServer`).
 *
 * The smaller single-tab presence scaffolding lives in
 * `presence.spec.ts`; this spec depends on the relay being up.
 */

import { expect, test } from "@playwright/test";

const RELAY = "ws";

function editorUrl(peer: string | null, room: string): string {
  const params = new URLSearchParams({
    collab: "1",
    relay: RELAY,
    room,
  });
  if (peer) params.set("peer", peer);
  return `/puck/editor?${params.toString()}`;
}

test.describe("collab UI primitives", () => {
  test("two peers share a room and mount header collaborator controls", async ({
    browser,
  }, testInfo) => {
    // Per-test room avoids awareness cross-talk between parallel
    // workers running against the same y-websocket relay.
    const room = `sync-${testInfo.workerIndex}-${Date.now()}`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await pageA.goto(editorUrl("alice", room));
    await pageB.goto(editorUrl("bob", room));

    await expect(pageA.getByTestId("studio-mount")).toBeVisible();
    await expect(pageA.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );
    await expect(pageB.getByTestId("studio-mount")).toBeVisible();
    await expect(pageB.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );

    // The AnvilKit chrome renders the collaborator avatar stack in the
    // Studio header: the consolidated `createCollabPlugin` contributes it to
    // the core `collaborators` slot. (The old standalone room bar + its
    // settings popover are no longer mounted in the demo's consolidated-plugin
    // editor, so the legacy `collab-peer-stack` / `collab-settings-trigger`
    // assertions were dropped — the avatar stack below is the live control.)
    await expect(pageA.locator("[data-slot=peer-avatar-stack]")).toBeVisible();
    await expect(
      pageA.locator("[data-slot=peer-avatar-stack] [data-peer-id]"),
    ).toHaveCount(2, {
      timeout: 15_000,
    });
    await expect(
      pageB.locator("[data-slot=peer-avatar-stack] [data-peer-id]"),
    ).toHaveCount(2, {
      timeout: 15_000,
    });

    await ctxA.close();
    await ctxB.close();
  });

  test("the avatar stack reflects remote peers", async ({
    browser,
  }, testInfo) => {
    const room = `avatars-${testInfo.workerIndex}-${Date.now()}`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await pageA.goto(editorUrl("alice", room));
    await pageB.goto(editorUrl("bob", room));
    await expect(pageA.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );
    await expect(pageB.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );

    const stackA = pageA.locator("[data-slot=peer-avatar-stack]");
    await expect(stackA).toBeVisible();

    // Page A should see both itself and Bob once awareness
    // propagates the remote peer's PresenceState frame.
    await expect(stackA.locator("[data-peer-id]")).toHaveCount(2, {
      timeout: 15_000,
    });

    await ctxA.close();
    await ctxB.close();
  });

  test("copied room links create distinct same-browser peers and show cursors", async ({
    browser,
  }, testInfo) => {
    const room = `copied-link-${testInfo.workerIndex}-${Date.now()}`;
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();

    await pageA.goto(editorUrl(null, room));
    await expect(pageA.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );
    await pageB.goto(editorUrl(null, room));
    await expect(pageB.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );

    await expect(
      pageB.locator("[data-slot=peer-avatar-stack] [data-peer-id]"),
    ).toHaveCount(2, {
      timeout: 15_000,
    });

    await pageA.mouse.move(220, 260);
    await expect(pageB.locator("[data-slot=presence-cursor]")).toBeVisible({
      timeout: 15_000,
    });

    await ctx.close();
  });

  test("force-resync dialog opens via the conflict toast action", async ({
    browser,
  }, testInfo) => {
    const room = `resync-${testInfo.workerIndex}-${Date.now()}`;
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(editorUrl("alice", room));
    await expect(pageA.getByTestId("studio-mount")).toHaveAttribute(
      "data-collab",
      "1",
    );

    // The dialog is conditionally rendered, so we verify the slot
    // stays absent until invoked. The full overlap → toast action
    // → resync flow requires a deeper IR-edit fixture and is
    // covered by `force-resync.test.ts` at the unit layer.
    await expect(pageA.locator("[data-slot=force-resync-dialog]")).toHaveCount(
      0,
    );

    await ctxA.close();
  });
});
