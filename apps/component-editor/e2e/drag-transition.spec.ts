import { expect, type Page, test } from "@playwright/test";

const TRANSITION_UPDATE_WARNING =
	"Detected a large number of updates inside startTransition";

const INSERT_COMPONENTS = ["Button", "Container", "Grid", "Stack"] as const;

async function dragDrawerItemToRoot(
	page: Page,
	componentName: string,
	commitTimeout = 5_000,
): Promise<number> {
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
	const droppedAt = performance.now();
	await page.mouse.up();

	await expect(
		canvasFrame.locator(`[data-puck-component^="${componentName}-"]`),
	).toHaveCount(1, { timeout: commitTimeout });
	return performance.now() - droppedAt;
}

test("drawer drag state releases on the first frame after pointer release", async ({
	page,
}, testInfo) => {
	await page.goto("/editor/e2e-drag-latency");
	await page.evaluate(() => {
		type DropFrameWindow = Window & {
			__dropFrameResult?: Promise<boolean>;
		};
		const host = window as DropFrameWindow;
		host.__dropFrameResult = new Promise<boolean>((resolve) => {
			let recorded = false;
			const record = () => {
				if (recorded) return;
				recorded = true;
				requestAnimationFrame(() => {
					const frame = document.querySelector("iframe") as HTMLIFrameElement;
					resolve(
						document.querySelector("[data-dnd-dragging]") === null &&
							frame.contentDocument?.querySelector("[data-dnd-dragging]") ===
								null,
					);
				});
			};
			window.addEventListener("pointerup", record, {
				capture: true,
				once: true,
			});
			const frameWindow = document.querySelector("iframe")?.contentWindow;
			frameWindow?.addEventListener("pointerup", record, {
				capture: true,
				once: true,
			});
		});
	});

	const commitMs = await dragDrawerItemToRoot(page, "Button");
	const releasedOnFirstFrame = await page.evaluate(
		() =>
			(window as Window & { __dropFrameResult?: Promise<boolean> })
				.__dropFrameResult,
	);

	expect(releasedOnFirstFrame).toBe(true);
	testInfo.annotations.push({
		type: "drop-commit-ms",
		description: commitMs.toFixed(1),
	});
	const canvasFrame = page.frameLocator('iframe[title="Page canvas"]');
	await canvasFrame.locator('[data-puck-component^="Button-"]').click();
	await expect(
		page.getByRole("textbox", { name: "Label", exact: true }),
	).toBeVisible({ timeout: 1_000 });
});

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

test("rich-text typing coalesces canvas updates and preserves final content", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await page.goto("/editor/e2e-rich-text-typing");
	await dragDrawerItemToRoot(page, "RichText");

	const canvasFrame = page.frameLocator('iframe[title="Page canvas"]');
	const canvasRichText = canvasFrame.locator(
		'[data-puck-component^="RichText-"]',
	);
	await canvasRichText.click();

	const fieldEditor = page.locator(
		'.ak-richtext-content[contenteditable="true"]',
	);
	await expect(fieldEditor).toBeVisible({ timeout: 5_000 });

	const rootDropZone = canvasFrame.getByTestId("dropzone:root:default-zone");
	await rootDropZone.evaluate((element) => {
		type MutationWindow = Window & {
			__richTextMutationBatches?: number;
			__richTextMutationObserver?: MutationObserver;
		};
		const frameWindow = element.ownerDocument.defaultView as MutationWindow;
		frameWindow.__richTextMutationBatches = 0;
		frameWindow.__richTextMutationObserver?.disconnect();
		frameWindow.__richTextMutationObserver = new MutationObserver(() => {
			frameWindow.__richTextMutationBatches =
				(frameWindow.__richTextMutationBatches ?? 0) + 1;
		});
		frameWindow.__richTextMutationObserver.observe(element, {
			characterData: true,
			childList: true,
			subtree: true,
		});
	});

	const finalContent = "Coalesced editor updates stay responsive";
	await fieldEditor.press("ControlOrMeta+A");
	await fieldEditor.pressSequentially(finalContent, { delay: 5 });
	await expect(fieldEditor).toContainText(finalContent);
	await expect(canvasRichText).toContainText(finalContent, { timeout: 5_000 });

	const mutationBatches = await rootDropZone.evaluate((element) => {
		type MutationWindow = Window & {
			__richTextMutationBatches?: number;
			__richTextMutationObserver?: MutationObserver;
		};
		const frameWindow = element.ownerDocument.defaultView as MutationWindow;
		frameWindow.__richTextMutationObserver?.disconnect();
		return frameWindow.__richTextMutationBatches ?? 0;
	});

	// The input generates one transaction per character. The field buffer
	// should collapse that burst into a handful of canvas renders.
	expect(mutationBatches).toBeLessThanOrEqual(6);
});
