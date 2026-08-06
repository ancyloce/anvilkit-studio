// @vitest-environment node
/**
 * @file PLAN-0025 Phase 1 exit gate — Node half of the
 * cross-environment fingerprint pair. Twin: the `.jsdom.test.ts`
 * file, which owns golden regeneration; this file only ever asserts.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDocumentAppearance } from "../../../style-compiler/index.js";
import {
	CROSSENV_FINGERPRINT_GOLDEN,
	crossenvConfig,
	crossenvDocument,
} from "./style-compiler-crossenv-fixture.js";

const goldenPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"__goldens__",
	CROSSENV_FINGERPRINT_GOLDEN,
);

describe("cross-environment fingerprint — node", () => {
	it("matches the committed fingerprint golden", () => {
		if (process.env.UPDATE_CSS_GOLDENS === "1") return;
		const compiled = compileDocumentAppearance({
			data: crossenvDocument,
			config: crossenvConfig,
		});
		expect(compiled.diagnostics).toHaveLength(0);
		expect(compiled.fingerprint).toBe(readFileSync(goldenPath, "utf8"));
	});
});
