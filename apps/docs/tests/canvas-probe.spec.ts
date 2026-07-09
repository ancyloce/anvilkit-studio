import { expect, test } from "@playwright/test";

/**
 * canvas-m0-006 probe — the demo's stage-interaction E2E is disabled because
 * react-konva's `<Stage>` renders no Konva content under React 19.2.7 / Next 16
 * (`apps/demo/e2e/canvas/editor-core.spec.ts` header). Docs runs the SAME React
 * 19.2.7 on a Vite/TanStack stack, so this probe isolates the variable:
 * Stage renders here → Next-specific (port coverage); fails here too →
 * react-konva × React 19.2.7 (imperative-renderer plan is the fix).
 */
test.describe.configure({ timeout: 180_000 });

test("react-konva Stage renders in the docs playground (Vite, React 19.2.7)", async ({
	page,
}) => {
	await page.goto("/playground");
	// The Studio shell mounts below the marketing banner and hydrates lazily —
	// wait for the editor canvas before touching plugin chrome.
	await expect(page.locator(".anvilkit-playground__canvas")).toBeVisible({
		timeout: 90_000,
	});
	const open = page.getByRole("button", { name: "Open Canvas" });
	await open.scrollIntoViewIfNeeded();
	await expect(open).toBeVisible({ timeout: 60_000 });
	await open.click();
	await expect(page.getByTestId("canvas-mode-overlay")).toBeVisible({
		timeout: 60_000,
	});
	// Decisive assertion: react-konva's reconciler must build the Konva DOM
	// (`.konvajs-content` wrapping a real <canvas>).
	await expect(page.locator(".konvajs-content canvas").first()).toBeVisible({
		timeout: 30_000,
	});
});
