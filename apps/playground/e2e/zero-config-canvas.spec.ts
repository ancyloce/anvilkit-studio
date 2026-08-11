import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

/**
 * PLAN-0035 `cp6-004` — the zero-configuration smoke E2E.
 *
 * THE CLAIM UNDER TEST: a third party can embed the canvas editor with no
 * configuration and complete a design. Nothing else tests it. `apps/studio`
 * wires an uploader, an asset picker, a brand kit, templates, persistence,
 * recovery and the export plugin, so its entire canvas suite stays green even
 * if the zero-config path is broken — which is exactly how the gap survived.
 *
 * The harness (`app/canvas/`) mounts `<CanvasWorkspace initialIR={blank} />`
 * with NO adapter props, importing only published `@anvilkit/*` entry points
 * in an app that declares no source aliases and no `transpilePackages`.
 *
 * WHY ONE SHARED PAGE. The loop is a loop: the image dropped in leg 1 has to
 * still be there in leg 6's post-reload export. Playwright gives every test a
 * fresh context (and therefore fresh `localStorage`, `IndexedDB` and object
 * URLs), which would erase the document between legs. So the loop runs on one
 * page opened in `beforeAll` and each leg is its own `test()` — the loop stays
 * a loop, and every leg still reports pass/fail on its own, which is the whole
 * point of a smoke test that is expected to find things.
 *
 * WHAT THIS SUITE IS ALLOWED TO DO WHEN IT FAILS: nothing. Assertions here are
 * written for what SHOULD be true. A red leg is a product finding to report,
 * not an assertion to soften.
 */

/**
 * Headroom for the one-time dev-server compile of the Konva-bearing chunk.
 * `apps/studio` measures ~265 s under Turbopack; this app runs the webpack
 * dev bundler, which is slower. Every later mount in the same run is seconds.
 */
const COLD_MOUNT_TIMEOUT_MS = 600_000;

/** Solid fill of the dropped image — nothing else in the design is magenta. */
const IMAGE_HEX = "#ff00ff";
/** The element's fill after recolouring — nothing else in the design is blue. */
const ELEMENT_HEX = "#0000ff";
/**
 * A default-catalog family that is emphatically NOT the editor's built-in
 * default (`text-tool.ts` creates text as `Inter`), so "the pick took effect"
 * cannot be satisfied by doing nothing. Serif vs sans also makes the metric
 * difference large enough to measure.
 */
const CATALOG_FAMILY = "Playfair Display";

interface SceneNode {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	text?: string;
	fontFamily?: string;
	fill?: unknown;
	assetId?: string;
}
interface Scene {
	count: number;
	activePageId: string;
	nodes: SceneNode[];
	assets: { id: string; scheme: string }[];
}

async function readScene(page: Page): Promise<Scene> {
	const raw = await page.getByTestId("zero-config-ir-debug").textContent();
	return JSON.parse(raw ?? "{}") as Scene;
}

async function gotoCanvas(
	page: Page,
	doc: string,
	options: { export?: boolean } = {},
): Promise<void> {
	const query = new URLSearchParams({ doc });
	if (options.export) query.set("export", "1");
	await page.goto(`/canvas?${query.toString()}`);
	await waitForWorkspace(page);
}

async function waitForWorkspace(page: Page): Promise<void> {
	await expect(page.getByTestId("zero-config-canvas-mount")).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
	await expect(
		page.locator('[data-testid="pages-canvas"] canvas').first(),
	).toBeAttached({ timeout: 120_000 });
	// Focus the shell: `WorkspaceShortcutLayer` listens on the workspace ROOT,
	// so a keystroke only reaches the registry once focus is inside it. Also
	// asserts the tool strip really mounted, and leaves Select active.
	const select = page.getByTestId("tool-strip-select");
	await expect(select).toBeVisible({ timeout: 60_000 });
	await select.click();
	await expect(select).toHaveAttribute("data-active", "true");
}

async function stageBox(page: Page) {
	const box = await page
		.locator('[data-testid="pages-canvas"] canvas')
		.first()
		.boundingBox();
	if (!box) throw new Error("canvas stage not found");
	return box;
}

/** Stage coordinates are FRACTIONS of the stage box — the stage is zoom-to-fit. */
function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function selectTool(page: Page, tool: string): Promise<void> {
	await page.getByTestId(`tool-strip-${tool}`).click();
	await expect(page.getByTestId(`tool-strip-${tool}`)).toHaveAttribute(
		"data-active",
		"true",
	);
}

/**
 * Drop a real, solid-colour PNG on the drop zone via a real `DragEvent`.
 *
 * The bytes are generated in the page rather than inlined as base64 so the
 * colour is a parameter — the export assertions identify each object by its
 * colour, and a 1×1 pixel would be invisible in a 1080×1080 export.
 */
async function dropImage(
	page: Page,
	point: { x: number; y: number },
	hex: string,
): Promise<void> {
	await page.evaluate(
		async ({ x, y, hex }) => {
			const zone = document.querySelector('[data-testid="canvas-drop-zone"]');
			if (!zone) throw new Error("canvas-drop-zone not found");
			const canvas = document.createElement("canvas");
			canvas.width = 240;
			canvas.height = 240;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("no 2d context for the test image");
			ctx.fillStyle = hex;
			ctx.fillRect(0, 0, 240, 240);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, "image/png"),
			);
			if (!blob) throw new Error("toBlob produced nothing");
			const file = new File([blob], "zero-config.png", { type: "image/png" });
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			for (const type of ["dragover", "drop"] as const) {
				zone.dispatchEvent(
					new DragEvent(type, {
						bubbles: true,
						cancelable: true,
						clientX: x,
						clientY: y,
						dataTransfer,
					}),
				);
			}
		},
		{ x: point.x, y: point.y, hex },
	);
}

interface PixelReport {
	width: number;
	height: number;
	totalPixels: number;
	uniqueColours: number;
	opaque: number;
	magenta: number;
	blue: number;
	dark: number;
	white: number;
}

/**
 * Classify pixels — either an exported PNG's, or the live Konva stage's.
 *
 * ONE `page.evaluate`, two sources, on purpose. A closure cannot cross the
 * evaluate boundary (Playwright serialises arguments, not scope), so two
 * readers would mean two copies of the colour thresholds — and a red export
 * leg would then be impossible to attribute, because "magenta" could mean two
 * different things on the two sides of the comparison.
 *
 * Decoding happens IN THE BROWSER (`createImageBitmap` + `OffscreenCanvas`):
 * no image codec is available to this app's Node side and adding one would be
 * a new dependency. The PNG bytes are the ones Playwright captured off the
 * download, so that path reads the artifact a user receives, not the stage.
 *
 * Konva composites onto several `<canvas>` elements; the stage path reads
 * every one under `pages-canvas` and sums, so it does not matter which layer
 * an object landed on. Object URLs are same-origin, so nothing is tainted and
 * `getImageData` is legal.
 *
 * `uniqueColours` counts 12-bit quantised colours: a raster that is blank — or
 * that is one flat placeholder — has exactly one.
 */
async function analysePixels(
	page: Page,
	pngBase64?: string,
): Promise<PixelReport> {
	return page.evaluate(async (b64: string | undefined) => {
		const total = {
			width: 0,
			height: 0,
			totalPixels: 0,
			uniqueColours: 0,
			opaque: 0,
			magenta: 0,
			blue: 0,
			dark: 0,
			white: 0,
		};
		const seen = new Set<number>();
		const classify = (data: Uint8ClampedArray): void => {
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i] ?? 0;
				const g = data[i + 1] ?? 0;
				const b = data[i + 2] ?? 0;
				const a = data[i + 3] ?? 0;
				if (a <= 200) continue;
				total.opaque++;
				seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
				if (r > 200 && g < 70 && b > 200) total.magenta++;
				else if (r < 70 && g < 70 && b > 200) total.blue++;
				else if (r < 70 && g < 70 && b < 70) total.dark++;
				else if (r > 240 && g > 240 && b > 240) total.white++;
			}
		};

		if (b64 !== undefined) {
			const binary = atob(b64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const bitmap = await createImageBitmap(
				new Blob([bytes], { type: "image/png" }),
			);
			const off = new OffscreenCanvas(bitmap.width, bitmap.height);
			const ctx = off.getContext("2d");
			if (!ctx) throw new Error("no OffscreenCanvas 2d context");
			ctx.drawImage(bitmap, 0, 0);
			const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			total.width = bitmap.width;
			total.height = bitmap.height;
			total.totalPixels = data.length / 4;
			classify(data);
		} else {
			const canvases = Array.from(
				document.querySelectorAll<HTMLCanvasElement>(
					'[data-testid="pages-canvas"] canvas',
				),
			);
			for (const canvas of canvases) {
				const ctx = canvas.getContext("2d");
				if (!ctx || canvas.width === 0 || canvas.height === 0) continue;
				const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
				total.width = Math.max(total.width, canvas.width);
				total.height = Math.max(total.height, canvas.height);
				total.totalPixels += data.length / 4;
				classify(data);
			}
		}
		total.uniqueColours = seen.size;
		return total;
	}, pngBase64);
}

/** The exported artifact a user would receive. */
async function analysePng(page: Page, filePath: string): Promise<PixelReport> {
	return analysePixels(page, readFileSync(filePath).toString("base64"));
}

/** What the live Konva stage is actually painting. */
async function analyseStage(page: Page): Promise<PixelReport> {
	return analysePixels(page);
}

interface FontProbe {
	/** Stylesheet `<link>` hrefs in the document naming this family. */
	links: string[];
	/** `document.fonts.check` for the family at the text tool's default size. */
	checked: boolean;
	/** Text width with the family first in the stack. */
	withFamily: number;
	/** The same text in the fallback alone. Equal widths ⇒ the family is absent. */
	fallback: number;
}

async function probeFont(page: Page, family: string): Promise<FontProbe> {
	return page.evaluate((fam) => {
		const slug = fam.replace(/ /g, "+").toLowerCase();
		const links = Array.from(
			document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
		)
			.map((l) => l.href)
			.filter((href) => href.toLowerCase().includes(slug));
		let checked = false;
		try {
			checked = document.fonts.check(`400 24px "${fam}"`);
		} catch {
			checked = false;
		}
		const ctx = document.createElement("canvas").getContext("2d");
		let withFamily = 0;
		let fallback = 0;
		if (ctx) {
			ctx.font = `24px "${fam}", monospace`;
			withFamily = ctx.measureText("Hamburgefonstiv").width;
			ctx.font = "24px monospace";
			fallback = ctx.measureText("Hamburgefonstiv").width;
		}
		return { links, checked, withFamily, fallback };
	}, family);
}

// ─────────────────────────────────────────────────────────────────────────────
// The loop.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("zero-config canvas — the full design loop", () => {
	/**
	 * SERIAL, AND SCOPED TO THIS DESCRIBE ONLY. The legs share one page, so a
	 * broken leg genuinely invalidates the ones after it. Scoping matters: at
	 * file scope this same call made the whole FILE one serial chain, so the
	 * first red leg also skipped the independent "affordances and controls"
	 * tests below — including the environment control that is the only thing
	 * able to tell a missing product seam from an offline runner.
	 */
	test.describe.configure({ mode: "serial", timeout: 900_000 });

	const DOC = `zero-config-${Date.now()}`;
	let page: Page;
	/** Set by leg 1 so later legs can assert the SAME asset survived. */
	let imageAssetId = "";

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		page.on("pageerror", (err) => {
			// Surfaced in the report; a hydration/runtime throw would otherwise
			// only show up as a mystifying downstream assertion failure.
			console.log(`[pageerror] ${err.stack ?? err.message}`);
		});
		// `?export=1` mounts the built-in export plugin. That single line IS
		// configuration, and it is opt-in precisely so the "affordances" suite
		// below can assert what a genuinely zero-prop mount offers instead.
		await gotoCanvas(page, DOC, { export: true });
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("leg 0 — a zero-adapter mount paints a workspace and an empty page", async () => {
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible();
		await expect(page.getByTestId("tool-strip")).toBeVisible();
		await expect(page.getByTestId("panel-dock")).toBeVisible();
		const scene = await readScene(page);
		expect(scene.count).toBe(0);
		expect(scene.assets).toEqual([]);

		// cp1-004: the image tool must be UN-gated by the local fallback picker.
		// `ToolStrip` renders image-picker tools only when `hasImagePicker`.
		await expect(page.getByTestId("tool-strip-image")).toBeVisible();
	});

	test("leg 1 — drop an image: the local fallback stores it and the stage renders it", async () => {
		const box = await stageBox(page);
		await dropImage(page, atStage(box, 0.25, 0.25), IMAGE_HEX);

		await expect
			.poll(async () => (await readScene(page)).count, { timeout: 60_000 })
			.toBe(1);

		const scene = await readScene(page);
		const image = scene.nodes.find((n) => n.type === "image");
		expect(image, "the drop inserted an image node").toBeDefined();
		imageAssetId = image?.assetId ?? "";
		expect(imageAssetId).not.toBe("");

		// cp1-002/cp1-004: the local uploader mints an object URL for the bytes
		// it just put in IndexedDB. Anything else means a different adapter ran.
		expect(scene.assets.map((a) => a.scheme)).toEqual(["blob"]);

		// cp1-004's headline acceptance criterion: the "no upload service
		// configured" toast fires ONLY when the fallback is explicitly disabled.
		await expect(
			page.getByText("This workspace has no upload service configured"),
		).toHaveCount(0);
		await expect(page.getByText("Upload failed")).toHaveCount(0);

		// …and it actually painted. A committed node that draws nothing is the
		// failure mode a scene readout cannot see.
		await expect
			.poll(async () => (await analyseStage(page)).magenta, { timeout: 30_000 })
			.toBeGreaterThan(50);
	});

	test("leg 2 — pick a catalog font: the family commits from the default catalog", async () => {
		await selectTool(page, "text");
		const box = await stageBox(page);
		const at = atStage(box, 0.78, 0.2);
		await page.mouse.click(at.x, at.y);
		await expect
			.poll(async () => (await readScene(page)).count, { timeout: 30_000 })
			.toBe(2);
		// Back to Select: the text tool leaves an inline editor overlay open, and
		// the inspector is the deterministic way to drive the value.
		await selectTool(page, "select");

		const textField = page.getByTestId("prop-text");
		await expect(textField).toBeVisible({ timeout: 30_000 });
		await textField.fill("Hamburgefonstiv");
		await textField.blur();
		await expect
			.poll(async () => {
				const s = await readScene(page);
				return s.nodes.find((n) => n.type === "text")?.text;
			})
			.toBe("Hamburgefonstiv");

		// The text tool's default is Inter; the pick must actually change it.
		const before = await readScene(page);
		expect(before.nodes.find((n) => n.type === "text")?.fontFamily).toBe(
			"Inter",
		);
		const beforeWidth = before.nodes.find((n) => n.type === "text")?.width ?? 0;

		// cp2-004/cp2-007: with NO `fontCatalog` prop the picker must still offer
		// the 37-family default catalog through the studio context.
		await page.getByTestId("prop-font-family").click();
		const search = page.getByTestId("prop-font-family-search");
		await expect(search).toBeVisible({ timeout: 30_000 });
		await search.fill("Playfair");
		const option = page
			.getByTestId("prop-font-family-option")
			.filter({ hasText: CATALOG_FAMILY })
			.first();
		await expect(option).toBeVisible({ timeout: 30_000 });
		await option.click();

		await expect
			.poll(
				async () => {
					const s = await readScene(page);
					return s.nodes.find((n) => n.type === "text")?.fontFamily;
				},
				{ timeout: 30_000 },
			)
			.toBe(CATALOG_FAMILY);

		// "Text re-measures." A text node authored by the text tool carries fixed
		// bounds, so the observable re-measure is the PAINTED advance width, not
		// `bounds.width` — recorded here so a future reader knows which of the two
		// this assertion is about.
		const after = await readScene(page);
		expect(after.nodes.find((n) => n.type === "text")?.width).toBe(beforeWidth);

		const probe = await probeFont(page, CATALOG_FAMILY);
		console.log(`[cp6-004] in-session font probe: ${JSON.stringify(probe)}`);
	});

	test("leg 3 — insert an element from the panel and recolour it", async () => {
		await page.getByTestId("panel-dock-elements").click();
		await expect(page.getByTestId("elements-panel")).toBeVisible({
			timeout: 60_000,
		});
		// cp3-002/cp3-003: with no `elementProvider` the panel loads the default
		// 425-entry catalog behind its own dynamic import.
		await page.getByTestId("tab-panel-search").fill("circle");
		const cell = page.getByTestId("elements-item-shape-circle");
		await expect(cell).toBeVisible({ timeout: 60_000 });
		// `.click()` can be swallowed when an overlay intercepts the hit test —
		// every canvas spec in this repo dispatches instead.
		await cell.dispatchEvent("click");

		await expect
			.poll(async () => (await readScene(page)).count, { timeout: 30_000 })
			.toBe(3);

		const scene = await readScene(page);
		const ellipse = scene.nodes.find((n) => n.type === "ellipse");
		expect(ellipse, "shape-circle inserted an ellipse node").toBeDefined();
		// cp3-004 inserts at the viewport centre; an element that lands outside
		// the page would be invisible in the export for a reason that has nothing
		// to do with export.
		expect(ellipse?.x ?? -1).toBeGreaterThanOrEqual(0);
		expect(ellipse?.y ?? -1).toBeGreaterThanOrEqual(0);
		expect((ellipse?.x ?? 0) + (ellipse?.width ?? 0)).toBeLessThanOrEqual(1080);
		expect((ellipse?.y ?? 0) + (ellipse?.height ?? 0)).toBeLessThanOrEqual(
			1080,
		);

		// cp3-005: recolour through the STANDARD inspector fill control. The
		// popover applies the hex on blur and commits on dismissal (Escape
		// cancels), so the trigger is toggled shut rather than escaped.
		const trigger = page.getByTestId("prop-fill");
		await expect(trigger).toBeVisible({ timeout: 30_000 });
		await trigger.click();
		const hex = page.getByTestId("prop-fill-hex");
		await expect(hex).toBeVisible({ timeout: 30_000 });
		await hex.fill(ELEMENT_HEX);
		await hex.blur();
		await trigger.click();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");

		await expect
			.poll(
				async () => {
					const s = await readScene(page);
					const node = s.nodes.find((n) => n.type === "ellipse");
					return JSON.stringify(node?.fill ?? "").toLowerCase();
				},
				{ timeout: 30_000 },
			)
			.toContain("0000ff");

		// Close the panel so the stage is back at full width for the export legs.
		await page.getByTestId("panel-dock-elements").click();

		await expect
			.poll(async () => (await analyseStage(page)).blue, { timeout: 30_000 })
			.toBeGreaterThan(50);
	});

	test("leg 4 — export PNG: non-blank, and containing the image, the text and the element", async () => {
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible({
			timeout: 30_000,
		});
		await page.getByTestId("export-format-png").click();
		const [download] = await Promise.all([
			page.waitForEvent("download", { timeout: 120_000 }),
			page.getByTestId("export-run").click(),
		]);
		const path = await download.path();
		expect(path, "the export produced a file").toBeTruthy();
		if (!path) return;

		// Claim 1 — the file has bytes.
		expect(statSync(path).size).toBeGreaterThan(0);

		const png = await analysePng(page, path);
		console.log(`[cp6-004] export PNG: ${JSON.stringify(png)}`);

		// Claim 2 — the raster is not blank. A single-colour image (the failure a
		// byte-size check cannot see) has exactly one quantised colour.
		expect(png.width).toBeGreaterThan(0);
		expect(png.uniqueColours).toBeGreaterThan(1);
		expect(png.opaque).toBeGreaterThan(0);

		// Claim 3 — all three objects are IN it, identified by colour.
		expect(png.magenta, "the dropped image").toBeGreaterThan(100);
		expect(png.blue, "the recoloured element").toBeGreaterThan(100);
		expect(png.dark, "the text glyphs").toBeGreaterThan(20);

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("export-dialog")).toBeHidden();
	});

	test("leg 5 — reload: the image survives and still paints", async () => {
		await page.reload();
		await waitForWorkspace(page);

		const scene = await readScene(page);
		expect(scene.count, "the host re-seeded the saved document").toBe(3);
		const image = scene.nodes.find((n) => n.type === "image");
		expect(image?.assetId).toBe(imageAssetId);
		// The persisted URI is the DEAD one — cp1-005 re-mints at render time and
		// deliberately never writes the fresh URL back into the document.
		expect(scene.assets.map((a) => a.scheme)).toEqual(["blob"]);

		// cp1-005's actual claim, at browser level for the first time: the bytes
		// come back out of IndexedDB and the node paints.
		await expect
			.poll(async () => (await analyseStage(page)).magenta, { timeout: 60_000 })
			.toBeGreaterThan(50);
		await expect(page.getByText("Missing image")).toHaveCount(0);
		await expect(page.getByText("An asset is missing")).toHaveCount(0);

		// Diagnostic only — leg 7 owns the assertion. Logged from HERE as well
		// because leg 6 between them is intermittently red (see its comment), and
		// serial mode skips everything after a failure: without this the font
		// evidence would go missing on exactly the runs that already found a bug.
		console.log(
			`[cp6-004] post-reload font probe (from leg 5): ${JSON.stringify(
				await probeFont(page, CATALOG_FAMILY),
			)}`,
		);
	});

	test("leg 6 — export PNG after a reload still contains the image", async () => {
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible({
			timeout: 30_000,
		});
		await page.getByTestId("export-format-png").click();
		const [download] = await Promise.all([
			page.waitForEvent("download", { timeout: 120_000 }),
			page.getByTestId("export-run").click(),
		]);
		const path = await download.path();
		expect(path).toBeTruthy();
		if (!path) return;

		const png = await analysePng(page, path);
		console.log(`[cp6-004] post-reload export PNG: ${JSON.stringify(png)}`);

		// cp1-006 recorded the risk: `export-runner.ts` and `pdfExporter` hand
		// `rasterizePage` the RAW `ir.assets`, not the rehydrated table, so a
		// post-reload raster can draw the missing-asset placeholder even though
		// the stage above it looks right. This is the combination nothing else
		// exercises, and it CONFIRMED the risk.
		//
		// THIS LEG IS INTERMITTENTLY RED, AND THAT IS THE FINDING — not test
		// flake. Measured 2026-08-11 over 11 consecutive runs: `magenta` came
		// back either 210348 (the whole image) or exactly 0 (no image at all),
		// never anything between, and 0 on 4 of the 11. The stage in leg 5 above
		// had already painted the image every single time. Whoever fixes this
		// must make the raster await the same rehydrated asset table the stage
		// renders from; adding a settle-delay here would only hide it.
		expect(png.uniqueColours).toBeGreaterThan(1);
		expect(png.magenta, "the dropped image, after a reload").toBeGreaterThan(
			100,
		);
		expect(png.blue, "the recoloured element, after a reload").toBeGreaterThan(
			100,
		);
		expect(png.dark, "the text glyphs, after a reload").toBeGreaterThan(20);

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("export-dialog")).toBeHidden();
	});

	/**
	 * LAST, and after leg 6 on purpose. Both are read-only observations of the
	 * reloaded document, but leg 6 is the combination nothing else in the repo
	 * exercises (reload + offscreen raster), so it must not be skipped by this
	 * leg going red — which is the known-gap expectation, not a surprise.
	 */
	test("leg 7 — after the reload the document's catalog font is loaded", async () => {
		// This is the leg the picker cannot flatter. In-session, opening the font
		// picker injects the family's stylesheet as a side effect of previewing
		// the OPTION (`font-preview.ts` `ensureFontStylesheet`, called only from
		// `font-picker-field.tsx`). After a reload the picker has never been
		// opened, so the only thing that could load the face is the DOCUMENT
		// using it. If nothing does, every catalog family but the host's own
		// renders in a fallback face — and nothing re-measures.
		const scene = await readScene(page);
		expect(scene.nodes.find((n) => n.type === "text")?.fontFamily).toBe(
			CATALOG_FAMILY,
		);

		const probe = await probeFont(page, CATALOG_FAMILY);
		console.log(`[cp6-004] post-reload font probe: ${JSON.stringify(probe)}`);

		expect(
			probe.links.length,
			`the document uses ${CATALOG_FAMILY}; its stylesheet must be in the document`,
		).toBeGreaterThan(0);
		expect(
			probe.checked,
			`${CATALOG_FAMILY} must be available to the canvas text measurer`,
		).toBe(true);
		expect(
			probe.withFamily,
			`${CATALOG_FAMILY} must measure differently from the fallback — otherwise text never re-measures`,
		).not.toBe(probe.fallback);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// What a genuinely zero-prop mount does and does not offer, plus the one
// environment control the font legs need in order to be believed.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("zero-config canvas — affordances and controls", () => {
	// Independent of the loop above and of each other — each opens its own page.
	// The generous timeout covers the same one-time dev-server compile the loop
	// pays for, plus the font control's own 20 s network budget.
	test.describe.configure({ timeout: 900_000 });

	test("a mount with NO headerPlugins offers no way to export", async ({
		page,
	}) => {
		await gotoCanvas(page, `zero-config-noexport-${Date.now()}`);
		// Everything else is there…
		await expect(page.getByTestId("tool-strip")).toBeVisible();
		await expect(page.getByTestId("panel-dock")).toBeVisible();
		// …but `CanvasWorkspace` mounts no export UI of its own: the built-in
		// export lives in `createCanvasExportPlugin()`, which the host must pass
		// as `headerPlugins`. Recorded as an assertion so the day it changes,
		// this test says so.
		await expect(page.getByTestId("workspace-export")).toHaveCount(0);
		await expect(page.getByTestId("canvas-export-trigger")).toHaveCount(0);
	});

	test("control: this browser CAN load a catalog family when a stylesheet is injected", async ({
		page,
	}) => {
		// Without this control, a red "leg 7" is ambiguous: an air-gapped or
		// proxied runner would produce exactly the same failure as a missing
		// product seam. This test injects the DEFAULT CATALOG's own CSS URL for
		// the same family, from the same origin and the same browser, and proves
		// the mechanism works — so leg 7's failure can only be the seam.
		//
		// It asserts on THE SAME DISCRIMINATOR leg 7 uses (the measured advance
		// width against the fallback), not on `document.fonts.check`. `check`
		// answers "could this be painted right now without loading anything",
		// which is TRUE for a family the document has never heard of — the
		// fallback needs no load. So `check` alone cannot separate "loaded" from
		// "absent", and a control built on it would pass on an offline runner.
		await gotoCanvas(page, `zero-config-fontcontrol-${Date.now()}`);
		const control = await page.evaluate(async (fam) => {
			const href = `https://fonts.googleapis.com/css2?family=${fam.replace(
				/ /g,
				"+",
			)}:ital,wght@0,400..900;1,400..900&display=swap`;
			const linkEvent = await new Promise<string>((resolve) => {
				const link = document.createElement("link");
				link.rel = "stylesheet";
				link.href = href;
				link.addEventListener("load", () => resolve("load"), { once: true });
				link.addEventListener("error", () => resolve("error"), { once: true });
				document.head.appendChild(link);
				setTimeout(() => resolve("timeout"), 20_000);
			});
			try {
				// A stylesheet only DECLARES the faces; the file downloads lazily on
				// first use, and canvas measurement never triggers that. Without this
				// explicit load the widths below would match the fallback even on a
				// perfectly healthy runner — which is exactly the trap leg 7 documents.
				await document.fonts.load(`400 24px "${fam}"`);
			} catch {
				// `load` rejects only for a malformed spec; the measurement below is
				// the assertion either way.
			}
			const ctx = document.createElement("canvas").getContext("2d");
			let withFamily = 0;
			let fallback = 0;
			if (ctx) {
				ctx.font = `24px "${fam}", monospace`;
				withFamily = ctx.measureText("Hamburgefonstiv").width;
				ctx.font = "24px monospace";
				fallback = ctx.measureText("Hamburgefonstiv").width;
			}
			return {
				linkEvent,
				checked: document.fonts.check(`400 24px "${fam}"`),
				withFamily,
				fallback,
			};
		}, CATALOG_FAMILY);
		console.log(
			`[cp6-004] font environment control: ${JSON.stringify(control)}`,
		);

		expect(
			control.linkEvent,
			"environment control: the catalog's own stylesheet URL must load in this browser",
		).toBe("load");
		expect(
			control.withFamily,
			"environment control: if this equals the fallback the runner cannot render the family at all and the font legs are inconclusive",
		).not.toBe(control.fallback);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// The deliverable everything above silently depends on.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "The harness imports only published `@anvilkit/*` entry points, so it fails
 * if something only works through a source alias."
 *
 * Every leg above is evidence for this only as long as nobody adds an alias —
 * and an alias added later would make the whole suite go green through a path
 * no third-party consumer has. So the property is asserted directly, from the
 * files that would have to carry such an alias.
 */
test.describe("zero-config canvas — published entry points, not source aliases", () => {
	/** Relative to `apps/playground/`, i.e. this spec's parent directory. */
	const read = (rel: string): string =>
		readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

	test("the app declares no aliasing of the canvas packages", () => {
		// Comments are stripped first: `next.config.js` documents the very policy
		// this asserts, so a raw substring search matches its own prose.
		const nextConfig = read("next.config.js")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "");
		expect(nextConfig).not.toContain("transpilePackages");
		expect(nextConfig).not.toContain("alias");
		expect(nextConfig).not.toContain("@anvilkit/");

		// The only `paths` entry may be the app's own `@/*` self-reference.
		const tsconfig = JSON.parse(read("tsconfig.json")) as {
			compilerOptions?: { paths?: Record<string, string[]> };
		};
		expect(Object.keys(tsconfig.compilerOptions?.paths ?? {})).toEqual(["@/*"]);
	});

	test("the harness imports bare package specifiers only", () => {
		const surface = read("app/canvas/ZeroConfigCanvasSurface.tsx");
		const specifiers = Array.from(
			surface.matchAll(/(?:from|import)\s+"([^"]+)"/g),
			(m) => m[1] ?? "",
		).filter((s) => s.includes("anvilkit"));

		expect(specifiers.length).toBeGreaterThan(0);
		for (const specifier of specifiers) {
			// A published entry point is `@anvilkit/<pkg>` plus an EXPORTED subpath.
			// `/src/`, `/dist/` and relative escapes are all source-path reach-ins.
			expect(
				specifier,
				`${specifier} must be a bare package specifier`,
			).toMatch(/^@anvilkit\/[a-z0-9-]+(\/[a-zA-Z0-9._-]+)*$/);
			expect(specifier).not.toContain("/src/");
			expect(specifier).not.toContain("/dist/");
		}
	});

	test("those specifiers resolve into published dist output", async () => {
		for (const specifier of [
			"@anvilkit/canvas-core",
			"@anvilkit/canvas-editor",
			"@anvilkit/canvas-editor/styles.css",
		]) {
			const resolved = await import.meta.resolve(specifier);
			expect(resolved, `${specifier} must resolve to built output`).toContain(
				"/dist/",
			);
			expect(resolved, `${specifier} must not resolve to source`).not.toContain(
				"/src/",
			);
		}
	});
});
