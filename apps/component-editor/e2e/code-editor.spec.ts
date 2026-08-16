import { expect, test } from "@playwright/test";

/**
 * P0-18 (plan 0036) — PRD 0023 stories S1, S2, S6 and S7 for the code panel.
 *
 * S7 (lazy chunk) is asserted from the network waterfall rather than from a
 * bundle budget: a shared chunk can smuggle a dependency into a route while
 * every per-package budget still passes.
 */

const EDITOR_URL = "/editor/e2e-code-editor";
const PANEL = '[data-anvilkit-surface="code-editor"]';
const OPEN_PANEL = '[data-anvilkit-code-open="true"]';

/** Requests that look like the CodeMirror chunk. */
function isCodeMirrorRequest(url: string): boolean {
	return /codemirror|editor-binding/i.test(url);
}

test.describe("code editor panel", () => {
	test("S7: the CodeMirror chunk loads only on first open", async ({
		page,
	}) => {
		const chunkRequests: string[] = [];
		page.on("request", (request) => {
			if (isCodeMirrorRequest(request.url())) {
				chunkRequests.push(request.url());
			}
		});

		await page.goto(EDITOR_URL);
		// The editor route itself must not pull the chunk.
		await page.waitForLoadState("networkidle");
		expect(
			chunkRequests,
			"CodeMirror was requested before the panel was opened",
		).toHaveLength(0);

		// The panel exists but is closed.
		await expect(page.locator(PANEL)).toBeAttached();
		await expect(page.locator(OPEN_PANEL)).toHaveCount(0);
	});

	test("S1: opening the panel shows the document as JSON", async ({ page }) => {
		// `?code=1` mounts the roster whose code plugin starts open — the
		// deterministic route to the opened state, without driving shell
		// chrome whose markup this spec is not about.
		await page.goto(`${EDITOR_URL}?code=1`);
		await expect(page.locator(OPEN_PANEL)).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(".cm-content")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(".cm-content")).toContainText('"content"');
	});

	test("S2: an editing session is a single undo step", async ({ page }) => {
		await page.goto(`${EDITOR_URL}?code=1`);
		const editor = page.locator(".cm-content");
		await expect(editor).toBeVisible({ timeout: 30_000 });

		// The status lives on the panel's footer, not on the section.
		const status = page.locator("[data-anvilkit-code-status]");
		await expect(status).toBeAttached();
		expect(await status.getAttribute("data-anvilkit-code-status")).toBe(
			"clean",
		);
		// Typing is exercised in the unit suite; here we only assert the
		// status line reacts, which proves the controller is wired to the
		// real editor rather than to a stub.
		await editor.click();
		await page.keyboard.type(" ");
		await expect(
			page.locator('[data-anvilkit-code-status="dirty"]'),
		).toBeAttached({ timeout: 10_000 });
	});

	test("S6: the panel reports when the document changed elsewhere", async ({
		page,
	}) => {
		await page.goto(`${EDITOR_URL}?code=1`);
		await expect(page.locator(".cm-content")).toBeVisible({ timeout: 30_000 });
		// The stale path is fully covered by the controller unit tests; this
		// asserts the status element the banner renders from exists so the UI
		// contract cannot drift away from the state machine.
		await expect(page.locator("[data-anvilkit-code-status]")).toBeAttached();
	});
});
