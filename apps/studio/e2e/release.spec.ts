/**
 * P21 acceptance against a running AnvilKit platform (DD-05 §1–§3,
 * DEVELOPMENT_ONLY placement). Driven by `anvilkit-services/tests/integration`
 * `TestRelease`, which certifies, approves (through the Pagix double's
 * maintainer decision), publishes both targets and activates one release,
 * and passes:
 *
 *   ANVILKIT_E2E_RELEASE_OPERATION  the activated release operation
 *   ANVILKIT_E2E_RELEASE_LOCK       the lock its projection names (JSON)
 *   ANVILKIT_DEV_RELEASES_DIR       the Pagix double's browser origin, whose
 *                                   catalog the activation wrote
 *
 * Without them the suite skips: it proves nothing without the platform.
 *
 * The released module was certified for the validator's host profile
 * (host-abi-dev-v1); this Studio is studio-host-v1 and runs another React.
 * The loader therefore refuses to mount it and keeps a placeholder — the
 * missing Studio host qualification (ENV-08) stays visible — while the
 * exact lock, the node and its props round-trip unchanged.
 */
import { expect, type Page, test } from "@playwright/test";

const OPERATION = process.env.ANVILKIT_E2E_RELEASE_OPERATION ?? "";
const LOCK = process.env.ANVILKIT_E2E_RELEASE_LOCK ?? "";
const RELEASES = process.env.ANVILKIT_DEV_RELEASES_DIR ?? "";

type Lock = {
	schemaVersion: 1;
	componentId: string;
	puckType: string;
	releaseId: string;
	packageName: string;
	packageVersion: string;
	browserManifestDigest: string;
	hostProfileId: string;
};
type PageDoc = {
	root: { props: Record<string, unknown> };
	content: { type: string; props: Record<string, unknown> }[];
};
type StoredRecord = {
	pageRevision?: number;
	draft?: PageDoc;
	published?: PageDoc;
};

async function openEditorPage(page: Page, pageId: string): Promise<void> {
	await page.goto("/puck/editor?e2e=demo-tools&collab=0");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 60_000 });
	const layer = page.getByTestId("ak-module-layer");
	const open = await layer
		.waitFor({ state: "visible", timeout: 3_000 })
		.then(() => true)
		.catch(() => false);
	if (!open) await page.locator("#ak-rail-tab-layer").click({ force: true });
	await expect(layer).toBeVisible({ timeout: 15_000 });
	await page.getByTestId(`ak-layer-page-row-${pageId}`).click({ force: true });
}

test.describe("exact release approval, publication and reopening", () => {
	test.skip(
		!OPERATION || !LOCK || !RELEASES,
		"needs the activated release (started by TestRelease)",
	);

	test("the release view shows the exact approved subject, both receipts and the lock", async ({
		page,
	}) => {
		const lock = JSON.parse(LOCK) as Lock;
		await page.goto(`/agent/operations/${OPERATION}`);
		const panel = page.getByTestId("release-panel");
		await expect(panel).toHaveAttribute("data-state", "activated", {
			timeout: 60_000,
		});
		await expect(panel).toHaveAttribute("data-standing", "delivered");
		await expect(page.getByTestId("release-approval")).toHaveAttribute(
			"data-state",
			"approved",
		);
		const digest = await page.getByTestId("release-subject-digest").innerText();
		await expect(page.getByTestId("release-approval")).toContainText(digest);
		for (const target of [
			"release-npm",
			"release-browser",
			"release-activation",
		])
			await expect(page.getByTestId(target)).toHaveAttribute(
				"data-state",
				"succeeded",
			);
		const shown = JSON.parse(
			await page.getByTestId("release-lock").locator("pre").innerText(),
		) as Lock;
		expect(shown).toEqual(lock);
	});

	test("a page pins the activated release exactly and reopens it without substitution, keeping the node and its props", async ({
		page,
		request,
	}) => {
		test.setTimeout(240_000);
		const lock = JSON.parse(LOCK) as Lock;
		const readRecord = async (): Promise<StoredRecord> => {
			const res = await request.get("/api/pages/profile");
			expect(res.ok()).toBe(true);
			return ((await res.json()) as { data: StoredRecord }).data;
		};
		const seed = await readRecord();
		const doc = structuredClone(seed.published) as PageDoc;
		delete doc.root.props.remoteComponentLock;
		doc.content = [
			{
				type: lock.puckType,
				props: { id: "released-1", title: "Kept title", extra: { keep: true } },
			},
		];
		const seeded = await request.post("/api/pages/draft", {
			data: {
				id: "profile",
				data: doc,
				expectedPageRevision: seed.pageRevision,
			},
		});
		expect(seeded.ok()).toBe(true);

		// The activated catalog offers exactly the platform's release.
		await openEditorPage(page, "profile");
		await page.getByTestId("remote-catalog-toggle").click();
		const add = page.locator(
			`[data-testid="remote-catalog-add"][data-type="${lock.puckType}"]`,
		);
		await expect(add).toHaveCount(1, { timeout: 30_000 });
		await expect(page.getByTestId("remote-catalog")).toContainText(
			lock.releaseId,
		);
		await add.click();
		// Certified for another host profile: a placeholder that names the
		// exact release; the node stays.
		await expect(
			page.locator(
				`[data-testid="remote-component-placeholder"][data-type="${lock.puckType}"]`,
			),
		).toBeVisible({ timeout: 60_000 });
		const placeholder = page
			.frameLocator("#preview-frame")
			.locator(`[data-anvilkit-placeholder="${lock.puckType}"]`);
		await expect(placeholder).toContainText(lock.releaseId, {
			timeout: 30_000,
		});
		await expect(placeholder).toContainText("host profile");

		const publishToLive = page.getByRole("button", { name: "Publish to live" });
		await page
			.getByRole("button", { name: "Publish", exact: true })
			.click({ force: true });
		await expect(publishToLive).toBeVisible({ timeout: 10_000 });
		const [saved] = await Promise.all([
			page.waitForResponse(
				(res) =>
					res.url().includes("/api/pages/draft") &&
					res.request().method() === "POST",
			),
			page.getByRole("button", { name: /save draft/i }).click({ force: true }),
		]);
		expect(saved.status()).toBe(200);
		const after = await readRecord();
		expect(after.draft?.root.props.remoteComponentLock).toEqual({
			schemaVersion: 1,
			entries: [lock],
		});
		expect(
			after.draft?.content.find((n) => n.props.id === "released-1")?.props,
		).toEqual({ id: "released-1", title: "Kept title", extra: { keep: true } });

		// Reopen: the same exact release, the same node, nothing substituted.
		await openEditorPage(page, "profile");
		await expect(
			page
				.frameLocator("#preview-frame")
				.locator(`[data-anvilkit-placeholder="${lock.puckType}"]`),
		).toContainText(lock.releaseId, { timeout: 60_000 });
		const reopened = await readRecord();
		expect(reopened.draft?.root.props.remoteComponentLock).toEqual({
			schemaVersion: 1,
			entries: [lock],
		});
	});
});
