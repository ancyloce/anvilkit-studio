/**
 * @file PLAN-0025 P0-05 — editor/export CSS goldens.
 *
 * Captures the CURRENT output of both style pipelines over the P0-04
 * legacy fixture as committed file snapshots. These are the migration
 * parity baselines: P1-06 requires the unified compiler to reproduce
 * these (normalized) before the legacy resolvers may be deleted, and
 * any accidental change to either pipeline during Phases 1–4 fails
 * here first.
 *
 * The live (canvas) and export pipelines are DIFFERENT algorithms
 * today — that divergence is the plan's §3.2 finding. The goldens
 * deliberately snapshot each pipeline separately; they detect drift
 * within a pipeline, not parity between them.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExportStylesheet } from "../../../editor/style/export-stylesheet.js";
import { buildAuthoringStylesheet } from "../../../react/editor/responsive/stylesheet.js";
import { legacyAuthoringSidecar } from "./legacy-fixtures.js";

const state = legacyAuthoringSidecar;

// Plain-file goldens instead of vitest's toMatchFileSnapshot: the file-
// snapshot client does not initialize under the package-level test
// script (vitest 4.1 + react-library preset), and the gate must pass
// through `pnpm --filter @anvilkit/core test`. Regenerate deliberately
// with UPDATE_CSS_GOLDENS=1 — never as a side effect of a normal run.
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "__goldens__");

function assertGolden(actual: string, name: string): void {
	const path = join(GOLDEN_DIR, name);
	if (process.env.UPDATE_CSS_GOLDENS === "1") {
		mkdirSync(GOLDEN_DIR, { recursive: true });
		writeFileSync(path, actual);
		return;
	}
	expect(actual).toBe(readFileSync(path, "utf8"));
}

const liveCss = (tokenMode: string): string =>
	buildAuthoringStylesheet(state, state.breakpoints, undefined, undefined, {
		tokenMode,
	});

describe("CSS goldens over the legacy fixture (P0-05)", () => {
	it("live (canvas) stylesheet matches its golden — light mode", () => {
		assertGolden(liveCss("light"), "legacy-live-light.css");
	});

	// The single expected diagnostic: the fixture's fontSize length-token
	// reference — a pre-existing pipeline defect captured deliberately
	// (see the fixture comment). Anything more or less is a regression.
	const knownFontSizeDefect = {
		code: "EDITOR_INVALID_CSS_VALUE",
		details: { property: "font-size", reason: "unresolved-token" },
	};

	it("export stylesheet matches its golden — light mode", async () => {
		const result = buildExportStylesheet({
			authoring: state,
			tokenMode: "light",
		});
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: knownFontSizeDefect.code,
				details: expect.objectContaining(knownFontSizeDefect.details),
			}),
		]);
		expect([...result.styledNodeIds].sort()).toEqual([
			"card-1",
			"hero-1",
			"zone-child-1",
		]);
		assertGolden(result.css, "legacy-export-light.css");
	});

	it("export stylesheet matches its golden — dark mode", async () => {
		const result = buildExportStylesheet({
			authoring: state,
			tokenMode: "dark",
		});
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: knownFontSizeDefect.code,
				details: expect.objectContaining(knownFontSizeDefect.details),
			}),
		]);
		assertGolden(result.css, "legacy-export-dark.css");
	});

	it("both pipelines are deterministic — repeat builds are byte-equal", () => {
		expect(liveCss("light")).toBe(liveCss("light"));
		expect(
			buildExportStylesheet({ authoring: state, tokenMode: "light" }).css,
		).toBe(buildExportStylesheet({ authoring: state, tokenMode: "light" }).css);
	});

	it("token mode changes the output (modes are not cosmetic)", () => {
		const light = buildExportStylesheet({
			authoring: state,
			tokenMode: "light",
		}).css;
		const dark = buildExportStylesheet({
			authoring: state,
			tokenMode: "dark",
		}).css;
		expect(light).not.toBe(dark);
	});
});
