import { expect, test } from "@playwright/test";

const PNG_BUFFER = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7n1kAAAAASUVORK5CYII=",
	"base64",
);

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

	await expect(page.getByTestId("asset-manager-status")).toContainText("Uploaded");

	await page.getByRole("button", { name: /run html asset export/i }).click({ force: true });
	await expect(page.getByTestId("asset-manager-html-output")).toContainText(
		"data:image/png;base64,",
	);
	await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
		"asset://",
	);

	await page.getByRole("button", { name: /run react asset export/i }).click({ force: true });
	await expect(page.getByTestId("asset-manager-react-output")).toContainText(
		'backgroundSrc="data:image/png;base64,',
	);
	await expect(page.getByTestId("asset-manager-react-output")).not.toContainText(
		"asset://",
	);

	await page.getByRole("button", { name: /simulate rogue uploader/i }).click({ force: true });
	await page.getByTestId("asset-manager-file-input").setInputFiles({
		name: "pixel.png",
		mimeType: "image/png",
		buffer: PNG_BUFFER,
	});

	await expect(page.getByTestId("asset-manager-status")).toContainText(
		"asset-rogue",
	);

	await page.getByRole("button", { name: /run html asset export/i }).click({ force: true });
	await page.getByRole("button", { name: /run react asset export/i }).click({ force: true });

	await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
		"javascript:",
	);
	await expect(page.getByTestId("asset-manager-html-output")).not.toContainText(
		"asset://",
	);
	await expect(page.getByTestId("asset-manager-react-output")).not.toContainText(
		"javascript:",
	);
	await expect(page.getByTestId("asset-manager-react-output")).not.toContainText(
		"asset://",
	);
	await expect(page.getByTestId("asset-manager-html-warnings")).toContainText(
		"ASSET_UNRESOLVED",
	);
	await expect(page.getByTestId("asset-manager-react-warnings")).toContainText(
		"ASSET_UNRESOLVED",
	);
});
