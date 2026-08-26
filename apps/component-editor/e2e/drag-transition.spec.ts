import { expect, type Page, test } from "@playwright/test";

const TRANSITION_UPDATE_WARNING =
	"Detected a large number of updates inside startTransition";

const INSERT_COMPONENTS = ["Button", "Container", "Grid", "Stack"] as const;

async function dragDrawerItemToRoot(page: Page, componentName: string) {
	const drawerItem = page.getByTestId(`drawer-item:${componentName}`);
	const canvasFrame = page.frameLocator('iframe[title="Page canvas"]');
	const rootDropZone = canvasFrame.getByTestId("dropzone:root:default-zone");
	await expect(drawerItem).toBeVisible({ timeout: 30_000 });
	await drawerItem.scrollIntoViewIfNeeded();
	await expect(rootDropZone).toBeVisible();

	// Playwright's locator.dragTo cannot cross from the drawer into Puck's
	// iframe. Pointer coordinates are page-relative even for a frame locator,
	// so drive the same cross-frame path as a user.
	const drawerItemBox = await drawerItem.boundingBox();
	const dropZoneBox = await rootDropZone.boundingBox();
	if (drawerItemBox === null)
		throw new Error(`${componentName} drawer item has no bounding box`);
	if (dropZoneBox === null)
		throw new Error("Root drop zone has no bounding box");
	await page.mouse.move(
		drawerItemBox.x + drawerItemBox.width / 2,
		drawerItemBox.y + drawerItemBox.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		dropZoneBox.x + dropZoneBox.width / 2,
		dropZoneBox.y + dropZoneBox.height / 2,
		{ steps: 30 },
	);
	await page.mouse.up();

	await expect(
		canvasFrame.locator(`[data-puck-component^="${componentName}-"]`),
	).toHaveCount(1);
}

test("drawer drag inserts basic and slot components without runtime errors", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const transitionWarnings: string[] = [];
	const runtimeErrors: string[] = [];
	page.on("console", (message) => {
		if (
			message.type() === "warning" &&
			message.text().includes(TRANSITION_UPDATE_WARNING)
		) {
			transitionWarnings.push(message.text());
		}
		if (message.type() === "error") runtimeErrors.push(message.text());
	});
	page.on("pageerror", (error) => runtimeErrors.push(error.message));

	for (const componentName of INSERT_COMPONENTS) {
		await page.goto(`/editor/e2e-drag-${componentName.toLowerCase()}`);
		await dragDrawerItemToRoot(page, componentName);
	}
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					setTimeout(resolve, 0);
				});
			}),
	);

	expect(transitionWarnings).toEqual([]);
	expect(runtimeErrors).toEqual([]);
});
