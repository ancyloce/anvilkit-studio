import { expect, test } from "@playwright/test";

test("Version history saves and restores snapshots from the sidebar", async ({
  page,
  context,
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Wipe any persisted snapshots from previous runs so list starts empty.
  await context.clearCookies();
  await page.goto("/puck/editor");
  await page.evaluate(() => {
    const namespace = "anvilkit-demo-version-history";
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(namespace)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) window.localStorage.removeItem(key);
  });
  await page.reload();

  // Studio + plugin pipeline alive.
  await expect
    .poll(
      () => consoleMessages.some((line) => line.includes("[smoke] onInit")),
      { timeout: 15_000 },
    )
    .toBe(true);

  // Open the History rail tab and assert the panel mounts.
  await page.getByRole("tab", { name: "History" }).click({ force: true });
  await expect(page.getByTestId("ak-history-panel")).toBeVisible();

  // Save a snapshot. SaveSnapshotButton renders a "Save snapshot" button
  // that reveals a label form; submitting calls adapter.save and the
  // list refreshes.
  await page
    .getByTestId("ak-history-panel")
    .getByRole("button", { name: "Save snapshot" })
    .click({ force: true });
  await page.getByPlaceholder("Optional label").fill("e2e-baseline");
  await page
    .getByTestId("ak-history-panel")
    .getByRole("button", { name: /^Save$/ })
    .click({ force: true });

  // Snapshot row appears.
  const snapshotRow = page
    .getByTestId("ak-history-panel")
    .getByRole("listitem")
    .filter({ hasText: "e2e-baseline" });
  await expect(snapshotRow).toBeVisible({ timeout: 5_000 });

  // Reload — localStorage adapter must keep the snapshot.
  await page.reload();
  await page.getByRole("tab", { name: "History" }).click({ force: true });
  await expect(
    page
      .getByTestId("ak-history-panel")
      .getByRole("listitem")
      .filter({ hasText: "e2e-baseline" }),
  ).toBeVisible({ timeout: 10_000 });

  // Open the snapshot to assert the modal mounts and exposes Restore.
  await page
    .getByTestId("ak-history-panel")
    .getByRole("listitem")
    .filter({ hasText: "e2e-baseline" })
    .click();
  await expect(page.getByRole("button", { name: /^Restore$/ })).toBeVisible({
    timeout: 5_000,
  });
});
