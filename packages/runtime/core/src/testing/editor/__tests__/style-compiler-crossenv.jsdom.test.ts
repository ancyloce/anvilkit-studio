/**
 * @file PLAN-0025 Phase 1 exit gate — jsdom (SSR-shaped) half of the
 * cross-environment fingerprint pair. Twin: the `.node.test.ts` file.
 * Regenerate the golden deliberately with UPDATE_CSS_GOLDENS=1.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDocumentAppearance } from "../../../style-compiler/index.js";
import {
	CROSSENV_FINGERPRINT_GOLDEN,
	crossenvConfig,
	crossenvDocument,
} from "./style-compiler-crossenv-fixture.js";

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "__goldens__");
const goldenPath = join(goldenDir, CROSSENV_FINGERPRINT_GOLDEN);

describe("cross-environment fingerprint — jsdom", () => {
	it("matches the committed fingerprint golden", () => {
		const compiled = compileDocumentAppearance({
			data: crossenvDocument,
			config: crossenvConfig,
		});
		expect(compiled.diagnostics).toHaveLength(0);
		if (process.env.UPDATE_CSS_GOLDENS === "1") {
			mkdirSync(goldenDir, { recursive: true });
			writeFileSync(goldenPath, compiled.fingerprint);
			return;
		}
		expect(compiled.fingerprint).toBe(readFileSync(goldenPath, "utf8"));
	});
});
