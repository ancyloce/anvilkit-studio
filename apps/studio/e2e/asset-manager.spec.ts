import { expect, test } from "@playwright/test";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7n1kAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Phase 4 acceptance: every adapter response is rejected unless it
 * passes the hardened validator (path-traversal, IDN homoglyph,
 * data-URL opt-in). The dedicated test surface mounts its own plugin
 * with `dataUrlAllowlistOptIn: true` so the safe path round-trips;
 * hostile fixtures still flow through the trust boundary and emit
 * `ASSET_UNRESOLVED` warnings on export.
 */

test("asset-manager resolver rewrites safe uploads and strips hostile URLs", async ({
  page,
}) => {
  await page.goto("/puck/editor?e2e=asset-manager");

  await expect(page.getByTestId("asset-manager-e2e")).toBeVisible();

  await page.getByTestId("asset-manager-file-input").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });

  await expect(page.getByTestId("asset-manager-status")).toContainText(
    "Uploaded",
  );

  await page
    .getByRole("button", { name: /run html asset export/i })
    .click({ force: true });
  await expect(page.getByTestId("asset-manager-html-output")).toContainText(
    "data:image/png;base64,",
  );
  await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
    "asset://",
  );

  await page
    .getByRole("button", { name: /run react asset export/i })
    .click({ force: true });
  await expect(page.getByTestId("asset-manager-react-output")).toContainText(
    'backgroundSrc="data:image/png;base64,',
  );
  await expect(
    page.getByTestId("asset-manager-react-output"),
  ).not.toContainText("asset://");

  await page
    .getByRole("button", { name: /simulate rogue uploader/i })
    .click({ force: true });
  await page.getByTestId("asset-manager-file-input").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });

  await expect(page.getByTestId("asset-manager-status")).toContainText(
    "asset-rogue",
  );

  await page
    .getByRole("button", { name: /run html asset export/i })
    .click({ force: true });
  await page
    .getByRole("button", { name: /run react asset export/i })
    .click({ force: true });

  await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
    "javascript:",
  );
  await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
    "asset://",
  );
  await expect(
    page.getByTestId("asset-manager-react-output"),
  ).not.toContainText("javascript:");
  await expect(
    page.getByTestId("asset-manager-react-output"),
  ).not.toContainText("asset://");
  await expect(page.getByTestId("asset-manager-html-warnings")).toContainText(
    "ASSET_UNRESOLVED",
  );
  await expect(page.getByTestId("asset-manager-react-warnings")).toContainText(
    "ASSET_UNRESOLVED",
  );
});

const HARDENING_FIXTURES = [
  {
    label: "data: URL without opt-in",
    rogueUrl: "data:image/png;base64,AAAA",
  },
  {
    label: "literal path traversal",
    rogueUrl: "https://cdn.example.com/../etc/passwd",
  },
  {
    label: "percent-encoded path traversal",
    rogueUrl: "https://cdn.example.com/%2e%2e/etc/passwd",
  },
  {
    label: "IDN homoglyph hostname",
    rogueUrl: "https://аpple.com/img.png",
  },
] as const;

for (const fixture of HARDENING_FIXTURES) {
  test(`hardened resolver rejects ${fixture.label}`, async ({ page }) => {
    await page.goto(
      `/puck/editor?e2e=asset-manager&rogueUrl=${encodeURIComponent(fixture.rogueUrl)}`,
    );
    await expect(page.getByTestId("asset-manager-e2e")).toBeVisible();

    await page
      .getByRole("button", { name: /simulate rogue uploader/i })
      .click({ force: true });
    await page.getByTestId("asset-manager-file-input").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: PNG_BUFFER,
    });
    await expect(page.getByTestId("asset-manager-status")).toContainText(
      "asset-rogue",
    );

    await page
      .getByRole("button", { name: /run html asset export/i })
      .click({ force: true });
    await page
      .getByRole("button", { name: /run react asset export/i })
      .click({ force: true });

    // The hostile URL must never reach either output: neither the raw
    // `asset://` reference nor the rejected URL itself should be
    // emitted.
    await expect(
      page.getByTestId("asset-manager-html-output"),
    ).not.toContainText("asset://");
    await expect(
      page.getByTestId("asset-manager-react-output"),
    ).not.toContainText("asset://");
    await expect(page.getByTestId("asset-manager-html-warnings")).toContainText(
      "ASSET_UNRESOLVED",
    );
    await expect(
      page.getByTestId("asset-manager-react-warnings"),
    ).toContainText("ASSET_UNRESOLVED");
  });
}
