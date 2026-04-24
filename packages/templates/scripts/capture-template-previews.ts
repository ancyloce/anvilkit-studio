/**
 * One-off regenerator for every template's `preview.png`. Loads each
 * template's `PageIR` into the demo's `/puck/render` route via the
 * `data` search param, takes a 1200×675 screenshot, runs it through
 * `sharp` to compress ≤200 KB, and writes it to
 * `packages/templates/<slug>/preview.png`.
 *
 * Run locally when a template's IR changes:
 *
 *   pnpm -C apps/demo dev &          # start the render route
 *   pnpm tsx packages/templates/scripts/capture-template-previews.ts
 *
 * Intentionally NOT a CI step — one-off per template change, not
 * per PR. The `templates-smoke.yml` cron catches rot without needing
 * the previews regenerated.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Lazy imports so the file typechecks in CI (playwright + sharp are
// dev-only deps added to `apps/demo`, not `packages/templates/`).
// The script is run from the repo root via `pnpm tsx`, so it picks
// them up through workspace hoisting.

interface PageIR {
	readonly version: "1";
	readonly root: unknown;
	readonly assets: readonly unknown[];
	readonly metadata: unknown;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const RENDER_URL =
	process.env.ANVILKIT_RENDER_URL ?? "http://localhost:3000/puck/render";
const MAX_PREVIEW_BYTES = 200 * 1024;

async function main() {
	const { chromium } = await import("playwright");
	const sharp = (await import("sharp")).default;

	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1200, height: 675 },
		deviceScaleFactor: 1,
	});

	const slugs = readdirSync(root, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== "scripts")
		.map((d) => d.name)
		.sort();

	for (const slug of slugs) {
		const irPath = join(root, slug, "src", "page-ir.json");
		if (!existsSync(irPath)) continue;

		const ir = JSON.parse(readFileSync(irPath, "utf8")) as PageIR;
		const url = `${RENDER_URL}?data=${encodeURIComponent(JSON.stringify(ir))}`;

		const page = await context.newPage();
		await page.goto(url, { waitUntil: "networkidle" });
		const raw = await page.screenshot({ fullPage: false, type: "png" });
		await page.close();

		const compressed = await sharp(raw)
			.png({ quality: 80, compressionLevel: 9 })
			.toBuffer();

		if (compressed.byteLength > MAX_PREVIEW_BYTES) {
			throw new Error(
				`${slug}: preview.png is ${compressed.byteLength} bytes, over the 200 KB budget`,
			);
		}

		writeFileSync(join(root, slug, "preview.png"), compressed);
		console.log(
			`ok ${slug.padEnd(22)} ${(compressed.byteLength / 1024).toFixed(1)} KB`,
		);
	}

	await browser.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
