#!/usr/bin/env node
/**
 * Writes a 1×1 transparent PNG as `preview.png` into every template
 * directory if no preview already exists. Real 1200×675 captures
 * come from `scripts/capture-template-previews.ts` (Playwright) —
 * this placeholder just keeps `package.json#files` resolvable and
 * `publint` green until the capture pass lands.
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Canonical 1×1 transparent PNG, 67 bytes. Produced with
// `pngcrush -brute` — byte-stable so diffs stay clean.
const ONE_PX_PNG = Buffer.from(
	"89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8CFC0F01F0000050001011AFB5BCD0000000049454E44AE426082",
	"hex",
);

const slugs = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory() && d.name !== "scripts")
	.map((d) => d.name);

for (const slug of slugs) {
	const dest = join(root, slug, "preview.png");
	if (existsSync(dest)) {
		continue;
	}
	writeFileSync(dest, ONE_PX_PNG);
	console.log(`wrote placeholder preview.png for ${slug}`);
}
