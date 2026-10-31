/**
 * P20 acceptance against a running AnvilKit platform (DD-05, DEVELOPMENT_ONLY
 * placement). Driven by `anvilkit-services/tests/integration`
 * `TestStudioWorkbench`, which starts the Agent API, Control, the Workflow
 * worker (real validator Jobs in kind), the separate preview origin and this
 * Studio, seeds one preview_build on a fresh lineage and passes:
 *
 *   ANVILKIT_E2E_SEED_OPERATION  the seeded preview_build (saved revision 2)
 *   ANVILKIT_E2E_PAGIX_DOUBLE    the source authority double's directory
 *   ANVILKIT_E2E_LINEAGE         the lineage the seed edits
 *   ANVILKIT_DEV_RELEASES_DIR    the (initially empty) release directory
 *
 * Without them the suite skips: it proves nothing without the platform.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";

const SEED = process.env.ANVILKIT_E2E_SEED_OPERATION ?? "";
const DOUBLE = process.env.ANVILKIT_E2E_PAGIX_DOUBLE ?? "";
const LINEAGE = process.env.ANVILKIT_E2E_LINEAGE ?? "";
const RELEASES = process.env.ANVILKIT_DEV_RELEASES_DIR ?? "";
const PREVIEW_TIMEOUT = 6 * 60_000;

const sha256 = (b: Buffer | string) =>
	`sha256:${createHash("sha256").update(b).digest("hex")}`;

async function openWorkbench(browser: Browser): Promise<Page> {
	const page = await browser.newPage();
	await page.goto(`/agent/workbench/${SEED}`);
	await expect(page.getByTestId("workbench-base-revision")).toHaveText(
		/^[0-9]+$/,
		{ timeout: 60_000 },
	);
	await page
		.getByRole("button", { name: "src/index.tsx", exact: true })
		.click();
	await expect(page.locator(".cm-content")).toBeVisible({ timeout: 30_000 });
	return page;
}

/** Replaces the default title in the open file (the whole text, typed as one insertion). */
async function editTitle(page: Page, title: string): Promise<void> {
	const current = await page.locator(".cm-content").innerText();
	const next = current.replace(
		/title: "[^"]*",\n(\s*subtitle)/,
		`title: "${title}",\n$1`,
	);
	expect(next).not.toBe(current);
	await page.locator(".cm-content").click();
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.insertText(next);
	await expect(page.locator(".cm-content")).toContainText(title);
}

async function save(page: Page): Promise<void> {
	await page.getByTestId("workbench-save").click();
	await expect(page.getByTestId("workbench-preview-state")).toBeVisible({
		timeout: 60_000,
	});
}

const previewState = (page: Page) =>
	page.getByTestId("workbench-preview-state");
const frameTitle = (page: Page) =>
	page.frameLocator('[data-testid="preview-frame"]').locator(".ak-hero__title");

/** Moves the lineage's current revision on, as another author's save would. */
function bumpLineage(): number {
	const file = path.join(
		DOUBLE,
		"sources",
		`${createHash("sha256").update(`source:${LINEAGE}`).digest("hex")}.json`,
	);
	const record = JSON.parse(readFileSync(file, "utf8")) as { revision: number };
	record.revision += 1;
	writeFileSync(`${file}.tmp`, JSON.stringify(record));
	writeFileSync(file, JSON.stringify(record));
	return record.revision;
}

test.describe("source workbench against the platform", () => {
	test.skip(
		!SEED || !DOUBLE || !LINEAGE,
		"needs the platform started by TestStudioWorkbench",
	);
	test.describe.configure({ mode: "serial" });

	test("concurrent editing: the second save conflicts, keeps its edits and saves after an explicit rebase", async ({
		browser,
	}) => {
		test.setTimeout(3 * PREVIEW_TIMEOUT);
		const a = await openWorkbench(browser);
		const b = await openWorkbench(browser);
		const base = await a.getByTestId("workbench-base-revision").innerText();
		expect(await b.getByTestId("workbench-base-revision").innerText()).toBe(
			base,
		);

		await editTitle(a, "Edited by author A");
		await editTitle(b, "Edited by author B");
		await save(a);
		await expect(previewState(a)).toHaveAttribute(
			"data-state",
			/building|ready/,
			{ timeout: PREVIEW_TIMEOUT },
		);
		const saved = String(Number(base) + 1);
		await expect(a.getByTestId("workbench-base-revision")).toHaveText(saved, {
			timeout: PREVIEW_TIMEOUT,
		});

		await save(b);
		await expect(previewState(b)).toHaveAttribute("data-state", "conflict", {
			timeout: PREVIEW_TIMEOUT,
		});
		await expect(b.getByTestId("workbench-conflict")).toContainText(saved);
		// Nothing was overwritten and B's edits are still in B's editor.
		await expect(b.locator(".cm-content")).toContainText("Edited by author B");
		await expect(b.getByTestId("workbench-base-revision")).toHaveText(base);
		await b.getByTestId("workbench-rebase").click();
		await expect(b.getByTestId("workbench-base-revision")).toHaveText(saved);
		await expect(b.locator(".cm-content")).toContainText("Edited by author B");
		await save(b);
		await expect(previewState(b)).toHaveAttribute(
			"data-state",
			/building|ready/,
			{ timeout: PREVIEW_TIMEOUT },
		);
		await expect(b.getByTestId("workbench-base-revision")).toHaveText(
			String(Number(saved) + 1),
			{ timeout: PREVIEW_TIMEOUT },
		);

		// A's saved revision renders in the separate-origin frame with its CSS.
		await expect(previewState(a)).toHaveAttribute("data-state", /ready|stale/, {
			timeout: PREVIEW_TIMEOUT,
		});
		await a.close();
		await expect(previewState(b)).toHaveAttribute("data-state", "ready", {
			timeout: PREVIEW_TIMEOUT,
		});
		await expect(frameTitle(b)).toHaveText("Edited by author B", {
			timeout: 60_000,
		});
		await expect(b.getByTestId("workbench-current")).toContainText(
			String(Number(saved) + 1),
		);
		const color = await b
			.frameLocator('[data-testid="preview-frame"]')
			.locator(".ak-hero")
			.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(17, 24, 39)");
		// The frame is sandboxed without same-origin: its document is not reachable from Studio.
		const reachable = await b.evaluate(() => {
			const frame = document.querySelector<HTMLIFrameElement>(
				'[data-testid="preview-frame"]',
			);
			try {
				return frame?.contentDocument !== null;
			} catch {
				return false;
			}
		});
		expect(reachable).toBe(false);
		expect(
			await b.locator('[data-testid="preview-frame"]').getAttribute("sandbox"),
		).toBe("allow-scripts");

		// Frame replacement ends the old session and a new one renders the same saved revision.
		await b.getByTestId("workbench-replace-frame").click();
		await expect(b.getByTestId("workbench-session")).toHaveText("ready", {
			timeout: 30_000,
		});
		await expect(frameTitle(b)).toHaveText("Edited by author B", {
			timeout: 60_000,
		});
		await b.close();
	});

	test("a preview whose revision moved on while it built is stale and never becomes current", async ({
		browser,
	}) => {
		test.setTimeout(2 * PREVIEW_TIMEOUT);
		const page = await openWorkbench(browser);
		await editTitle(page, "Edited while someone else saves");
		await save(page);
		// The page opened on the seed's revision; the first test moved the
		// lineage on, so this save conflicts first and is rebased explicitly.
		await expect(previewState(page)).toHaveAttribute(
			"data-state",
			/building|conflict/,
			{ timeout: PREVIEW_TIMEOUT },
		);
		if ((await previewState(page).getAttribute("data-state")) === "conflict") {
			await page.getByTestId("workbench-rebase").click();
			await expect(page.locator(".cm-content")).toContainText(
				"Edited while someone else saves",
			);
			await save(page);
		}
		await expect(previewState(page)).toHaveAttribute("data-state", "building", {
			timeout: PREVIEW_TIMEOUT,
		});
		const moved = bumpLineage();
		await expect(previewState(page)).toHaveAttribute("data-state", "stale", {
			timeout: PREVIEW_TIMEOUT,
		});
		await expect(page.getByTestId("workbench-stale")).toContainText(
			String(moved),
		);
		await expect(page.getByTestId("workbench-current")).toHaveCount(0);
		await expect(frameTitle(page)).toHaveCount(0);
		await page.close();
	});
});

// ---- exact remote component locks in the editor ----

interface Release {
	readonly schemaVersion: 1;
	readonly componentId: string;
	readonly puckType: string;
	readonly releaseId: string;
	readonly packageName: string;
	readonly packageVersion: string;
	readonly browserManifestDigest: string;
	readonly hostProfileId: string;
}

/** Writes one release (entry, stylesheet, manifest) into the release directory; returns its lock entry. */
function writeRelease(
	puckType: string,
	releaseId: string,
	version: string,
	marker: string,
	color: string,
): Release {
	const dir = path.join(RELEASES, releaseId);
	mkdirSync(dir, { recursive: true });
	const entry = `import { createElement } from "react";
export default {
  label: ${JSON.stringify(`${puckType} ${version}`)},
  fields: { title: { type: "text" } },
  defaultProps: { title: ${JSON.stringify(marker)} },
  render: ({ title }) => createElement("div", { className: "remote-${releaseId}", "data-remote": ${JSON.stringify(releaseId)} }, title),
};
`;
	const css = `.remote-${releaseId} { color: ${color}; }\n`;
	writeFileSync(path.join(dir, "index.js"), entry);
	writeFileSync(path.join(dir, "index.css"), css);
	const identity = {
		componentId: `cmp-${puckType.toLowerCase()}`,
		puckType,
		releaseId,
		packageName: `@anvilkit-e2e/${puckType.toLowerCase()}`,
		packageVersion: version,
	};
	const manifest = JSON.stringify({
		schemaVersion: 1,
		hostProfileId: "studio-host-v1",
		identity,
		entry: {
			path: "index.js",
			digest: sha256(entry),
			sizeBytes: String(Buffer.byteLength(entry)),
		},
		styles: [
			{
				path: "index.css",
				digest: sha256(css),
				sizeBytes: String(Buffer.byteLength(css)),
			},
		],
	});
	writeFileSync(path.join(dir, "browser-manifest.json"), manifest);
	return {
		schemaVersion: 1,
		...identity,
		browserManifestDigest: sha256(manifest),
		hostProfileId: "studio-host-v1",
	};
}

/** Opens the editor on one page through the Layer rail, as the pages-management spec does. */
async function openEditorPage(page: Page, pageId: string): Promise<void> {
	await page.goto("/puck/editor?e2e=demo-tools&collab=0");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 60_000 });
	// The active rail tab persists per store; clicking an open tab would close it.
	const layer = page.getByTestId("ak-module-layer");
	const open = await layer
		.waitFor({ state: "visible", timeout: 3_000 })
		.then(() => true)
		.catch(() => false);
	if (!open) await page.locator("#ak-rail-tab-layer").click({ force: true });
	await expect(layer).toBeVisible({ timeout: 15_000 });
	await page.getByTestId(`ak-layer-page-row-${pageId}`).click({ force: true });
}

function writeCatalog(releases: readonly Release[]): void {
	writeFileSync(
		path.join(RELEASES, "catalog.json"),
		JSON.stringify({ schemaVersion: 1, releases }),
	);
}

type PageDoc = {
	root: { props: Record<string, unknown> };
	content: { type: string; props: Record<string, unknown> }[];
};
type StoredRecord = {
	pageRevision?: number;
	draft?: PageDoc;
	published?: PageDoc;
};

test.describe("exact remote component locks", () => {
	test.skip(
		!RELEASES,
		"needs ANVILKIT_DEV_RELEASES_DIR (started by TestStudioWorkbench)",
	);

	test("loads locked releases without a host rebuild, reserves types, keeps unknown nodes and saves/reopens the exact lock", async ({
		page,
		request,
	}) => {
		test.setTimeout(240_000);
		// Releases appear while the host runs: nothing is rebuilt.
		const card = writeRelease(
			"RemoteCard",
			"rel-card-1",
			"1.0.0",
			"Remote card 1.0.0",
			"rgb(4, 5, 6)",
		);
		const hero = writeRelease(
			"Hero",
			"rel-hero-remote-1",
			"2.0.0",
			"Remote hero",
			"rgb(7, 8, 9)",
		);
		writeCatalog([card, hero]);

		const readRecord = async (): Promise<StoredRecord> => {
			const res = await request.get("/api/pages/profile");
			expect(res.ok()).toBe(true);
			return ((await res.json()) as { data: StoredRecord }).data;
		};
		const seed = await readRecord();
		const doc = structuredClone(seed.published) as PageDoc;
		doc.root.props.remoteComponentLock = { schemaVersion: 1, entries: [card] };
		doc.content = [
			{
				type: "RemoteCard",
				props: {
					id: "remote-card-1",
					title: "Locked card",
					extra: { keep: [1, 2] },
				},
			},
			{ type: "Mystery", props: { id: "mystery-1", secret: "kept as is" } },
			...doc.content,
		];
		const seeded = await request.post("/api/pages/draft", {
			data: {
				id: "profile",
				data: doc,
				expectedPageRevision: seed.pageRevision,
			},
		});
		expect(seeded.ok()).toBe(true);

		await openEditorPage(page, "profile");
		await expect(
			page.locator(
				'[data-testid="remote-component-loaded"][data-type="RemoteCard"]',
			),
		).toBeVisible({ timeout: 60_000 });
		await expect(
			page.locator(
				'[data-testid="remote-component-placeholder"][data-type="Mystery"]',
			),
		).toBeVisible();
		const canvas = page.frameLocator("#preview-frame");
		await expect(canvas.getByText("Locked card")).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			canvas.locator('[data-anvilkit-placeholder="Mystery"]'),
		).toBeVisible();
		// The release's stylesheet was installed from its verified bytes before the module mounted.
		await expect(
			page.locator('link[data-anvilkit-release="rel-card-1"]'),
		).toHaveCount(1);

		// A catalog release of a built-in type reserves that type for this page.
		await page.getByTestId("remote-catalog-toggle").click();
		await page
			.locator('[data-testid="remote-catalog-add"][data-type="Hero"]')
			.click();
		await expect(
			page.locator(
				'[data-testid="remote-component-collision"][data-type="Hero"]',
			),
		).toBeVisible({ timeout: 60_000 });
		await expect(
			page.locator('[data-testid="remote-component-loaded"][data-type="Hero"]'),
		).toBeVisible();

		// Save: the stored draft carries the exact lock and every node as it was.
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
			entries: [hero, card],
		});
		expect(
			after.draft?.content.find((n) => n.props.id === "mystery-1")?.props,
		).toEqual({ id: "mystery-1", secret: "kept as is" });
		expect(
			after.draft?.content.find((n) => n.props.id === "remote-card-1")?.props,
		).toEqual({
			id: "remote-card-1",
			title: "Locked card",
			extra: { keep: [1, 2] },
		});

		// A newer release in the catalog is never substituted on reopen.
		const newer = writeRelease(
			"RemoteCard",
			"rel-card-2",
			"1.1.0",
			"Remote card 1.1.0",
			"rgb(1, 1, 1)",
		);
		writeCatalog([card, hero, newer]);
		await openEditorPage(page, "profile");
		await expect(
			page.locator(
				'[data-testid="remote-component-loaded"][data-type="RemoteCard"]',
			),
		).toBeVisible({ timeout: 60_000 });
		await expect(
			page.frameLocator("#preview-frame").getByText("Locked card"),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator('link[data-anvilkit-release="rel-card-2"]'),
		).toHaveCount(0);
		await page.getByTestId("remote-catalog-toggle").click();
		await expect(
			page
				.locator('[data-testid="remote-catalog-add"][data-type="RemoteCard"]')
				.first(),
		).toBeDisabled();
		const reopened = await readRecord();
		expect(reopened.draft?.root.props.remoteComponentLock).toEqual({
			schemaVersion: 1,
			entries: [hero, card],
		});
	});

	test("a release whose bytes do not match its lock loads as a placeholder and blocks nothing else", async ({
		page,
		request,
	}) => {
		test.setTimeout(180_000);
		const tampered = writeRelease(
			"TamperedCard",
			"rel-tampered-1",
			"1.0.0",
			"Tampered",
			"rgb(2, 2, 2)",
		);
		writeFileSync(
			path.join(RELEASES, "rel-tampered-1", "index.js"),
			'export default { render: () => "changed" };\n',
		);
		const res = await request.get("/api/pages/about");
		const seed = ((await res.json()) as { data: StoredRecord }).data;
		const doc = structuredClone(seed.published) as PageDoc;
		doc.root.props.remoteComponentLock = {
			schemaVersion: 1,
			entries: [tampered],
		};
		doc.content = [
			{ type: "TamperedCard", props: { id: "tampered-1", title: "kept" } },
			...doc.content,
		];
		expect(
			(
				await request.post("/api/pages/draft", {
					data: {
						id: "about",
						data: doc,
						expectedPageRevision: seed.pageRevision,
					},
				})
			).ok(),
		).toBe(true);
		await openEditorPage(page, "about");
		await expect(
			page.locator(
				'[data-testid="remote-component-placeholder"][data-type="TamperedCard"]',
			),
		).toBeVisible({ timeout: 60_000 });
		await expect(
			page
				.frameLocator("#preview-frame")
				.locator('[data-anvilkit-placeholder="TamperedCard"]'),
		).toContainText("does not match");
		// The rest of the page still renders and edits.
		await expect(
			page
				.frameLocator("#preview-frame")
				.locator("[data-puck-component]")
				.nth(1),
		).toBeVisible();
	});
});
