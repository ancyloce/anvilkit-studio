import { inflateSync } from "node:zlib";
import type { CanvasIR } from "@anvilkit/canvas-core";
import { expect, type Locator, type Page, test } from "@playwright/test";

/** PLAN-0039 E3-T6 — browser persistence and effective-asset parity. */
const COLD_MOUNT_TIMEOUT_MS = 420_000;
const PINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e11d75"/></svg>`;
const LOCAL_ASSET_DB = "anvilkit-canvas-assets";
const OFFLINE_CACHE = "anvilkit-e3-offline-v1";
const OFFLINE_SW_PATH = "/e3-offline-sw.js";
const OFFLINE_SW = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cache = await caches.open("${OFFLINE_CACHE}");
	const cached = await cache.match(event.request);
	if (cached) return cached;
	return fetch(event.request);
  })());
});
`;

test.describe.configure({ mode: "serial", timeout: 600_000 });

type SceneDebug = {
	count: number;
	nodes: Array<{ id: string; type: string; x: number; assetId?: string }>;
};

interface UploadedFixture {
	readonly assetId: string;
	readonly nodeId: string;
	readonly movedX: number;
	readonly firstPageId: string;
	readonly secondPageId?: string;
}

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
	await expect(
		page.locator('[data-testid="pages-canvas"] canvas').first(),
	).toBeAttached({ timeout: 60_000 });
}

async function readScene(page: Page): Promise<SceneDebug> {
	return JSON.parse(
		(await page.getByTestId("canvas-ir-debug").textContent()) ?? "{}",
	) as SceneDebug;
}

async function readStoredIR(page: Page, pageId: string): Promise<CanvasIR> {
	return page.evaluate((id) => {
		const raw = localStorage.getItem(`demo-canvas:designs:${id}`);
		if (!raw) throw new Error(`No persisted Canvas document for ${id}`);
		return JSON.parse(raw) as CanvasIR;
	}, pageId);
}

async function uploadEditAndSave(
	page: Page,
	pageId: string,
	addSecondPage = false,
): Promise<UploadedFixture> {
	await gotoCanvas(page, pageId);
	await page.getByTestId("panel-dock-uploads").click();
	await page.getByTestId("uploads-input").setInputFiles({
		name: "e3-pink.svg",
		mimeType: "image/svg+xml",
		buffer: Buffer.from(PINK_SVG),
	});
	await expect(
		page.locator('[data-testid^="upload-task-"][data-status="done"]'),
	).toHaveCount(1, { timeout: 30_000 });
	await expect
		.poll(async () => (await readScene(page)).count, { timeout: 30_000 })
		.toBe(1);

	const before = await readScene(page);
	const inserted = before.nodes[0];
	if (!inserted?.assetId) throw new Error("Uploaded image was not inserted");
	await page.getByTestId("host-select-all").dispatchEvent("click");
	await page.getByTestId("host-nudge-x").dispatchEvent("click");
	await expect
		.poll(async () => (await readScene(page)).nodes[0]?.x, {
			timeout: 10_000,
		})
		.toBe(inserted.x + 100);

	if (addSecondPage) {
		await page.getByTestId("page-add").first().click();
		await expect(page.locator('[data-testid^="page-row-"]')).toHaveCount(2);
	}
	await expect(page.getByTestId("workspace-save-status")).toHaveAttribute(
		"data-status",
		"saved",
		{ timeout: 20_000 },
	);
	await expect
		.poll(async () => (await readStoredIR(page, pageId)).pages.length, {
			timeout: 20_000,
		})
		.toBe(addSecondPage ? 2 : 1);

	const stored = await readStoredIR(page, pageId);
	const firstPage = stored.pages.find((candidate) => candidate.id === pageId);
	const secondPage = stored.pages.find((candidate) => candidate.id !== pageId);
	if (!firstPage) throw new Error("Persisted document lost its first page");
	return {
		assetId: inserted.assetId,
		nodeId: inserted.id,
		movedX: inserted.x + 100,
		firstPageId: firstPage.id,
		...(secondPage ? { secondPageId: secondPage.id } : {}),
	};
}

async function rewriteStoredAssetUri(
	page: Page,
	pageId: string,
	assetId: string,
	uri: string,
): Promise<void> {
	await page.evaluate(
		({ id, targetAssetId, nextUri }) => {
			const key = `demo-canvas:designs:${id}`;
			const raw = localStorage.getItem(key);
			if (!raw) throw new Error(`No persisted Canvas document for ${id}`);
			const ir = JSON.parse(raw) as CanvasIR;
			const asset = ir.assets[targetAssetId];
			if (!asset) throw new Error(`No persisted asset ${targetAssetId}`);
			ir.assets[targetAssetId] = { ...asset, uri: nextUri };
			localStorage.setItem(key, JSON.stringify(ir));
		},
		{ id: pageId, targetAssetId: assetId, nextUri: uri },
	);
}

async function seedIndexedDbAsset(page: Page, assetId: string): Promise<void> {
	await page.evaluate(
		async ({ databaseName, id, source }) => {
			const blob = new Blob([source], { type: "image/svg+xml" });
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(databaseName, 1);
				request.onupgradeneeded = () => {
					const opened = request.result;
					if (!opened.objectStoreNames.contains("blobs")) {
						opened.createObjectStore("blobs", { keyPath: "id" });
					}
					if (!opened.objectStoreNames.contains("meta")) {
						opened.createObjectStore("meta", { keyPath: "id" });
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			await new Promise<void>((resolve, reject) => {
				const transaction = db.transaction(["blobs", "meta"], "readwrite");
				transaction.objectStore("blobs").put({ id, blob });
				transaction.objectStore("meta").put({
					id,
					mimeType: "image/svg+xml",
					byteSize: blob.size,
					createdAt: Date.now(),
					width: 64,
					height: 64,
					name: "e3-pink.svg",
				});
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			});
			db.close();
		},
		{ databaseName: LOCAL_ASSET_DB, id: assetId, source: PINK_SVG },
	);
}

async function openAssetHealth(page: Page): Promise<void> {
	if (
		!(await page
			.getByTestId("uploads-panel")
			.isVisible()
			.catch(() => false))
	) {
		await page.getByTestId("panel-dock-uploads").click();
	}
	await expect(page.getByTestId("asset-health")).toBeVisible();
}

async function pinkPixelsOnStage(page: Page): Promise<number> {
	return page
		.locator('[data-testid="pages-canvas"] canvas')
		.evaluateAll((canvases) => {
			let count = 0;
			for (const element of canvases) {
				const canvas = element as HTMLCanvasElement;
				const context = canvas.getContext("2d");
				if (!context) continue;
				const pixels = context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				).data;
				for (let index = 0; index < pixels.length; index += 4) {
					if (
						(pixels[index] ?? 0) > 180 &&
						(pixels[index + 1] ?? 255) < 100 &&
						(pixels[index + 2] ?? 0) > 80
					) {
						count += 1;
					}
				}
			}
			return count;
		});
}

async function assetErrorPixelsOnStage(page: Page): Promise<number> {
	return page
		.locator('[data-testid="pages-canvas"] canvas')
		.evaluateAll((canvases) => {
			let count = 0;
			for (const element of canvases) {
				const canvas = element as HTMLCanvasElement;
				const context = canvas.getContext("2d");
				if (!context) continue;
				const pixels = context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				).data;
				for (let index = 0; index < pixels.length; index += 4) {
					const red = pixels[index] ?? 0;
					const green = pixels[index + 1] ?? 0;
					const blue = pixels[index + 2] ?? 0;
					if (
						red > green + 5 &&
						red > blue + 5 &&
						green > blue - 5
					) {
						count += 1;
					}
				}
			}
			return count;
		});
}

async function pinkPixelsInImage(imageLocator: Locator): Promise<number> {
	return imageLocator.evaluate(async (node) => {
		const image = node as HTMLImageElement;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		if (!context) return 0;
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let count = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			if (
				(pixels[index] ?? 0) > 180 &&
				(pixels[index + 1] ?? 255) < 100 &&
				(pixels[index + 2] ?? 0) > 80
			) {
				count += 1;
			}
		}
		return count;
	});
}

async function downloadExport(page: Page, format: string): Promise<Buffer> {
	await page.getByTestId(`export-format-${format}`).click();
	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page.getByTestId("export-run").click(),
	]);
	const path = await download.path();
	if (!path) throw new Error(`${format} export did not produce a file`);
	return Buffer.from(
		await download.createReadStream().then(async (stream) => {
			const chunks: Buffer[] = [];
			for await (const chunk of stream) chunks.push(Buffer.from(chunk));
			return Buffer.concat(chunks);
		}),
	);
}

async function pinkPixelsInRaster(
	page: Page,
	bytes: Buffer,
	mimeType: string,
): Promise<number> {
	return page.evaluate(
		async ({ base64, type }) => {
			const response = await fetch(`data:${type};base64,${base64}`);
			const bitmap = await createImageBitmap(await response.blob());
			const canvas = document.createElement("canvas");
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext("2d");
			if (!context) return 0;
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			const pixels = context.getImageData(
				0,
				0,
				canvas.width,
				canvas.height,
			).data;
			let count = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				if (
					(pixels[index] ?? 0) > 170 &&
					(pixels[index + 1] ?? 255) < 115 &&
					(pixels[index + 2] ?? 0) > 65
				) {
					count += 1;
				}
			}
			return count;
		},
		{ base64: bytes.toString("base64"), type: mimeType },
	);
}

function pinkPixelsInPdf(bytes: Buffer): number {
	const streamMarker = Buffer.from("stream");
	const endMarker = Buffer.from("endstream");
	let cursor = 0;
	let pink = 0;
	while (cursor < bytes.length) {
		const stream = bytes.indexOf(streamMarker, cursor);
		if (stream < 0) break;
		// pdf-lib may nest `/DecodeParms << … >>` inside the image dictionary.
		// Starting at the nearest `<<` would therefore omit `/Subtype /Image` and
		// silently skip a valid raster. Anchor at the current indirect object so
		// the whole dictionary participates in the image/filter checks.
		const objectStart = bytes.lastIndexOf(Buffer.from(" obj"), stream);
		const dictionary = bytes
			.subarray(Math.max(0, objectStart), stream)
			.toString("latin1");
		let dataStart = stream + streamMarker.length;
		if (bytes[dataStart] === 13) dataStart += 1;
		if (bytes[dataStart] === 10) dataStart += 1;
		const end = bytes.indexOf(endMarker, dataStart);
		if (end < 0) break;
		cursor = end + endMarker.length;
		if (!dictionary.includes("/Subtype /Image")) continue;
		const declaredLength = dictionary.match(/\/Length\s+(\d+)/)?.[1];
		const byteLength = declaredLength ? Number(declaredLength) : undefined;
		let payload = bytes.subarray(
			dataStart,
			byteLength !== undefined && dataStart + byteLength <= end
				? dataStart + byteLength
				: end,
		);
		try {
			if (dictionary.includes("/FlateDecode")) payload = inflateSync(payload);
		} catch {
			continue;
		}
		for (let index = 0; index + 2 < payload.length; index += 1) {
			if (
				(payload[index] ?? 0) > 170 &&
				(payload[index + 1] ?? 255) < 115 &&
				(payload[index + 2] ?? 0) > 65
			) {
				pink += 1;
			}
		}
	}
	return pink;
}

async function reopenOffline(page: Page, assetId: string): Promise<void> {
	const context = page.context();
	const originalUrl = page.url();
	const probeUrl = new URL(
		`/studio/canvas/e3-offline-probe?asset=${encodeURIComponent(assetId)}`,
		originalUrl,
	).href;
	const probeHtml = `<!doctype html><html><body><canvas></canvas><script>
	(async () => {
		try {
			const assetId = new URL(location.href).searchParams.get("asset");
			const db = await new Promise((resolve, reject) => {
				const request = indexedDB.open("${LOCAL_ASSET_DB}", 1);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const record = await new Promise((resolve, reject) => {
				const request = db.transaction("blobs", "readonly").objectStore("blobs").get(assetId);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			db.close();
			if (!(record && record.blob instanceof Blob)) throw new Error("asset bytes missing");
			const image = new Image();
			image.src = URL.createObjectURL(record.blob);
			await image.decode();
			const canvas = document.querySelector("canvas");
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext("2d");
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			let pink = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				if (pixels[index] > 180 && pixels[index + 1] < 100 && pixels[index + 2] > 80) pink += 1;
			}
			document.body.dataset.pinkPixels = String(pink);
			document.body.dataset.ready = "true";
		} catch (error) {
			document.body.dataset.error = String(error);
			document.body.dataset.ready = "error";
		}
	})();
	</script></body></html>`;
	await context.route(`**${OFFLINE_SW_PATH}`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/javascript",
			headers: { "Service-Worker-Allowed": "/" },
			body: OFFLINE_SW,
		}),
	);
	await page.evaluate(async (scriptPath) => {
		await navigator.serviceWorker.register(scriptPath, {
			scope: "/studio/canvas/",
		});
		await navigator.serviceWorker.ready;
	}, OFFLINE_SW_PATH);
	await expect
		.poll(() =>
			page.evaluate(() => navigator.serviceWorker.controller !== null),
		)
		.toBe(true);
	await page.evaluate(
		async ({ cacheName, url, html }) => {
			const cache = await caches.open(cacheName);
			await cache.put(
				url,
				new Response(html, {
					headers: { "content-type": "text/html; charset=utf-8" },
				}),
			);
		},
		{ cacheName: OFFLINE_CACHE, url: probeUrl, html: probeHtml },
	);
	await context.setOffline(true);
	try {
		await page.goto(probeUrl, {
			waitUntil: "domcontentloaded",
			timeout: 60_000,
		});
		await expect(page.locator('body[data-ready="true"]')).toBeVisible({
			timeout: 30_000,
		});
		expect(
			Number(await page.locator("body").getAttribute("data-pink-pixels")),
		).toBeGreaterThan(100);
	} finally {
		await context.setOffline(false);
	}
	await page.evaluate(async (cacheName) => {
		for (const registration of await navigator.serviceWorker.getRegistrations()) {
			await registration.unregister();
		}
		await caches.delete(cacheName);
	}, OFFLINE_CACHE);
	await context.unroute(`**${OFFLINE_SW_PATH}`);
	await page.goto(originalUrl, { timeout: 60_000 });
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
}

test.describe("Canvas Studio — asset persistence and portability", () => {
	test("upload → edit → save → reload/offline → thumbnail → every export format", async ({
		page,
	}) => {
		const pageId = `e3-portable-${Date.now()}`;
		const fixture = await uploadEditAndSave(page, pageId, true);
		if (!fixture.secondPageId)
			throw new Error("Expected a second page fixture");
		const localUri = `blob:canvas-local/${fixture.assetId}`;
		await rewriteStoredAssetUri(page, pageId, fixture.assetId, localUri);
		await seedIndexedDbAsset(page, fixture.assetId);

		await page.reload();
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: COLD_MOUNT_TIMEOUT_MS,
		});
		await expect
			.poll(async () => (await readScene(page)).nodes[0]?.x, {
				timeout: 30_000,
			})
			.toBe(fixture.movedX);
		await expect
			.poll(() => pinkPixelsOnStage(page), { timeout: 30_000 })
			.toBeGreaterThan(0);
		await openAssetHealth(page);
		await expect(
			page.getByText("All document assets are available."),
		).toBeVisible({
			timeout: 30_000,
		});

		await reopenOffline(page, fixture.assetId);
		await expect
			.poll(() => pinkPixelsOnStage(page), { timeout: 30_000 })
			.toBeGreaterThan(0);

		await page.getByTestId(`page-activate-${fixture.secondPageId}`).click({
			timeout: 30_000,
		});
		const firstPageThumbnail = page
			.getByTestId(`page-activate-${fixture.firstPageId}`)
			.locator("img");
		await expect(firstPageThumbnail).toBeVisible({
			timeout: 30_000,
		});
		await expect
			.poll(() => pinkPixelsInImage(firstPageThumbnail), { timeout: 30_000 })
			.toBeGreaterThan(10);
		await page.getByTestId(`page-activate-${fixture.firstPageId}`).click({
			timeout: 30_000,
		});
		await expect
			.poll(() => pinkPixelsOnStage(page), { timeout: 30_000 })
			.toBeGreaterThan(0);

		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		const formats = [
			["png", "image/png"],
			["jpeg", "image/jpeg"],
			["webp", "image/webp"],
			["svg", "image/svg+xml"],
			["pdf", "application/pdf"],
			["pdf-print", "application/pdf"],
			["json", "application/json"],
		] as const;
		for (const [format, mimeType] of formats) {
			const bytes = await downloadExport(page, format);
			expect(bytes.byteLength).toBeGreaterThan(0);
			if (format === "png" || format === "jpeg" || format === "webp") {
				expect(await pinkPixelsInRaster(page, bytes, mimeType)).toBeGreaterThan(
					100,
				);
			} else if (format === "svg") {
				const svg = bytes.toString("utf8");
				expect(svg).toContain("<image");
				expect(svg).toContain("data:image/svg+xml");
			} else if (format === "pdf" || format === "pdf-print") {
				expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
				expect(pinkPixelsInPdf(bytes)).toBeGreaterThan(100);
			} else {
				const exported = JSON.parse(bytes.toString("utf8")) as CanvasIR;
				expect(exported.assets[fixture.assetId]?.uri).toMatch(
					/^data:image\/svg\+xml/,
				);
				expect(
					exported.pages
						.flatMap((candidate) => candidate.root.children)
						.some(
							(node) =>
								node.type === "image" && node.assetId === fixture.assetId,
						),
				).toBe(true);
			}
		}
	});

	test("failed upload preserves the design and offers an in-place retry", async ({
		page,
	}) => {
		await gotoCanvas(page, `e3-failed-upload-${Date.now()}`);
		await page.getByTestId("panel-dock-uploads").click();
		await page.getByTestId("uploads-input").setInputFiles({
			name: "too-large.png",
			mimeType: "image/png",
			buffer: Buffer.alloc(1_048_577, 0x61),
		});
		const failed = page.locator(
			'[data-testid^="upload-task-"][data-status="failed"]',
		);
		await expect(failed).toHaveCount(1, { timeout: 30_000 });
		expect((await readScene(page)).count).toBe(0);
		const retry = page.locator('[data-testid^="upload-retry-"]');
		await expect(retry).toBeVisible();
		await retry.click();
		await expect(failed).toHaveCount(1, { timeout: 30_000 });
		await expect(page.locator('[data-testid^="upload-task-"]')).toHaveCount(1);
		expect((await readScene(page)).count).toBe(0);
	});

	test("an expired remote URL fails visibly without deleting its reference", async ({
		page,
	}) => {
		const pageId = `e3-expired-${Date.now()}`;
		const fixture = await uploadEditAndSave(page, pageId);
		const expiredPath = `/e3-expired-assets/${fixture.assetId}.svg`;
		let requests = 0;
		await page.route(`**${expiredPath}`, async (route) => {
			requests += 1;
			await route.fulfill({ status: 410, body: "expired" });
		});
		await rewriteStoredAssetUri(
			page,
			pageId,
			fixture.assetId,
			`http://localhost:3000${expiredPath}`,
		);
		await page.reload();
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: COLD_MOUNT_TIMEOUT_MS,
		});
		await expect.poll(() => requests, { timeout: 30_000 }).toBeGreaterThan(0);
		await expect
			.poll(() => assetErrorPixelsOnStage(page), { timeout: 30_000 })
			.toBeGreaterThan(0);
		const scene = await readScene(page);
		expect(scene.nodes[0]?.id).toBe(fixture.nodeId);
		expect(scene.nodes[0]?.assetId).toBe(fixture.assetId);
	});

	test("a missing IndexedDB record is reported while the saved design survives", async ({
		page,
	}) => {
		const pageId = `e3-missing-idb-${Date.now()}`;
		const fixture = await uploadEditAndSave(page, pageId);
		await rewriteStoredAssetUri(
			page,
			pageId,
			fixture.assetId,
			`blob:canvas-local/${fixture.assetId}`,
		);
		await page.reload();
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: COLD_MOUNT_TIMEOUT_MS,
		});
		await openAssetHealth(page);
		await expect(
			page.getByTestId(`asset-health-${fixture.assetId}`),
		).toHaveAttribute("data-status", "missing", { timeout: 30_000 });
		const scene = await readScene(page);
		expect(scene.nodes[0]?.id).toBe(fixture.nodeId);
		expect(scene.nodes[0]?.assetId).toBe(fixture.assetId);
		await expect(page.getByTestId("canvas-toast-viewport")).toContainText(
			"An asset is missing",
			{ timeout: 30_000 },
		);
	});
});
