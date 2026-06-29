/**
 * @file Analytics loop E2E (PRD 0004). Asserts the demo's editor + published
 * surfaces actually POST the right system events to `/api/analytics/events`:
 *
 *   1. Chrome `PublishPanel` → "Publish to live" → a `page_published`
 *      (source `studio`) lands at the ingestion endpoint.
 *   2. "Save draft" → a `draft_saved` (source `studio`).
 *   3. Visiting the published render route → a `page_view`
 *      (source `published_site`).
 *
 * Network capture mirrors `asset-unsplash.spec.ts` (intercept + fulfill); the
 * publish/save UI flow mirrors `asset-manager-puck-drag.spec.ts`. The HTTP
 * adapter batches and flushes on a ~5s timer, so each assertion polls the
 * captured batches with a generous timeout rather than expecting an instant POST.
 */

import { expect, type Page, test } from "@playwright/test";

interface CapturedEvent {
	event_name: string;
	source: string;
	properties?: Record<string, unknown>;
	[key: string]: unknown;
}

/**
 * Intercept `POST /api/analytics/events`, record every event in the batch, and
 * fulfill with the real success envelope so the adapter marks it delivered.
 */
async function captureAnalytics(page: Page): Promise<CapturedEvent[]> {
	const events: CapturedEvent[] = [];
	await page.route("**/api/analytics/events", async (route) => {
		const raw = route.request().postData() ?? "{}";
		try {
			const body = JSON.parse(raw) as { events?: CapturedEvent[] };
			for (const event of body.events ?? []) events.push(event);
		} catch {
			// ignore malformed bodies — the assertion will simply not see the event
		}
		await route.fulfill({
			status: 200,
			json: { ok: true, accepted: 1 },
		});
	});
	return events;
}

const hasEvent = (
	events: CapturedEvent[],
	name: string,
	source: string,
): boolean => events.some((e) => e.event_name === name && e.source === source);

test.describe.configure({ mode: "serial", timeout: 120_000 });

async function gotoEditor(page: Page): Promise<void> {
	await page.goto("/puck/editor?e2e=puck-drag&collab=0");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });
}

async function openPublishPanel(page: Page): Promise<void> {
	await page
		.getByRole("button", { name: "Publish", exact: true })
		.click({ force: true });
}

test("chrome PublishPanel → Publish to live emits page_published (source studio)", async ({
	page,
}) => {
	const events = await captureAnalytics(page);
	await gotoEditor(page);

	await openPublishPanel(page);
	const publishToLive = page.getByRole("button", { name: "Publish to live" });
	await expect(publishToLive).toBeVisible({ timeout: 5_000 });
	await publishToLive.click({ force: true });

	await expect
		.poll(() => hasEvent(events, "page_published", "studio"), {
			timeout: 15_000,
		})
		.toBe(true);

	// Privacy boundary: the published event carries only primitive props and no
	// page document / HTML / DOM / root.
	const published = events.find((e) => e.event_name === "page_published");
	for (const value of Object.values(published?.properties ?? {})) {
		expect(["string", "number", "boolean"]).toContain(typeof value);
	}
	expect(JSON.stringify(published)).not.toContain("<");
});

test("Save draft emits draft_saved (source studio)", async ({ page }) => {
	const events = await captureAnalytics(page);
	await gotoEditor(page);

	await openPublishPanel(page);
	const saveDraft = page.getByRole("button", { name: /save draft/i });
	await expect(saveDraft).toBeVisible({ timeout: 5_000 });
	await saveDraft.click({ force: true });

	await expect
		.poll(() => hasEvent(events, "draft_saved", "studio"), { timeout: 15_000 })
		.toBe(true);
});

test("visiting the published render route emits page_view (source published_site)", async ({
	page,
}) => {
	const events = await captureAnalytics(page);
	await page.goto("/puck/render");
	// The showcase render mounts <PublishedPageAnalytics>, which fires one
	// page_view with primitive path/slug/preview props.
	await expect
		.poll(() => hasEvent(events, "page_view", "published_site"), {
			timeout: 15_000,
		})
		.toBe(true);

	const pageView = events.find((e) => e.event_name === "page_view");
	expect(typeof pageView?.properties?.path).toBe("string");
	expect(typeof pageView?.properties?.preview).toBe("boolean");
	// Anonymous identity rides as primitive props for the stats endpoint.
	expect(typeof pageView?.properties?.visitor_id).toBe("string");
	expect(typeof pageView?.properties?.session_id).toBe("string");
});

test("published visits persist and the stats endpoint aggregates them", async ({
	page,
}) => {
	// NO interception here: events hit the real ingestion endpoint so they
	// persist in the in-process store and the stats endpoint can read them back.
	const statsViews = async (): Promise<number> => {
		const res = await page.request.get("/api/analytics/stats?range=all");
		const body = (await res.json()) as {
			ok: boolean;
			data?: { views: number };
		};
		return body.ok && body.data ? body.data.views : 0;
	};

	const before = await statsViews();

	// Two real visits. The HTTP adapter flushes on a ~5s timer; wait it out.
	await page.goto("/puck/render");
	await page.waitForTimeout(6_000);
	await page.goto("/puck/render?nav=2");
	await page.waitForTimeout(6_000);

	await expect
		.poll(() => statsViews(), { timeout: 20_000 })
		.toBeGreaterThan(before);
});
