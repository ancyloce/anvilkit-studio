/**
 * @file P4-07 — the Phase 4 exit-gate evidence (PLAN-0025 §12):
 * "the same Data produces one matching CSS fingerprint in the editor
 * iframe, preview, public RSC, HTML export, and React export."
 *
 * What jsdom can prove, this file proves against ONE fixture (the
 * Phase 1 cross-environment document):
 *
 * - **public RSC + preview** — `AnvilKitRender` (both routes render
 *   through it; the preview branch differs only in payload selection,
 *   locked by the studio's `preview-route-parity` suite) emits the
 *   direct compile byte-for-byte;
 * - **editor canvas** — the composition host wiring
 *   (`AppearanceIframeOverride` around `Puck.Preview`) emits the same
 *   bytes from the live Puck document; the overrides-path wiring
 *   (`CanvasIframe` → `CompiledAppearanceMount`) is locked
 *   structurally because AutoFrame never reaches ready under jsdom —
 *   its runtime invocation joins the deferred true-browser pass
 *   (same status as the P2 bridge);
 * - **exports** — the export runner's artifact carries the direct
 *   compile's fingerprint; the HTML/React formats embed that
 *   artifact's CSS verbatim (locked byte-level in each plugin's
 *   `compiled-appearance` suite, which this file cannot import —
 *   packages must not depend on extensions).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExportFormatDefinition } from "@anvilkit/contracts";
import { Puck } from "@puckeditor/core";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { runExport } from "../../../export/run-export.js";
import { AppearanceIframeOverride } from "../../../react/editor/composition/AppearanceIframeOverride.js";
import { AnvilKitRender } from "../../../react/render/AnvilKitRender.js";
import type { CompiledAppearance } from "../../../style-compiler/compile.js";
import { compileDocumentAppearance } from "../../../style-compiler/compile.js";
import type { PageIR } from "../../../types/ir.js";
import {
	crossenvConfig,
	crossenvDocument,
} from "./style-compiler-crossenv-fixture.js";

const direct = compileDocumentAppearance({
	data: crossenvDocument,
	config: crossenvConfig,
});

function appearanceStyles(root: ParentNode): HTMLStyleElement[] {
	return [
		...root.querySelectorAll<HTMLStyleElement>(
			"style[data-anvilkit-appearance]",
		),
	];
}

afterEach(cleanup);

describe("Phase 4 exit gate — one fingerprint across surfaces", () => {
	it("compiles the fixture to a non-trivial stylesheet", () => {
		expect(direct.css).toContain('[data-ak-style-node="hero-x"]');
		expect(direct.fingerprint.length).toBeGreaterThan(0);
		expect(direct.diagnostics).toEqual([]);
	});

	it("public RSC / preview surface: AnvilKitRender emits the direct compile byte-for-byte", () => {
		const compiledSeen: CompiledAppearance[] = [];
		const { container } = render(
			<AnvilKitRender
				config={crossenvConfig}
				data={crossenvDocument}
				onCompiled={(compiled) => {
					compiledSeen.push(compiled);
				}}
			/>,
		);
		const styles = appearanceStyles(container);
		expect(styles).toHaveLength(1);
		expect(styles[0]?.textContent).toBe(direct.css);
		expect(compiledSeen[0]?.fingerprint).toBe(direct.fingerprint);
	});

	it("editor canvas surface: the live composition wiring emits the same bytes from Puck state", () => {
		const { container } = render(
			<Puck
				config={crossenvConfig}
				data={crossenvDocument}
				iframe={{ enabled: false }}
			>
				<AppearanceIframeOverride>
					<Puck.Preview />
				</AppearanceIframeOverride>
			</Puck>,
		);
		const styles = appearanceStyles(container.ownerDocument);
		expect(styles).toHaveLength(1);
		expect(styles[0]?.textContent).toBe(direct.css);
	});

	it("export surface: the export runner's artifact carries the same fingerprint", async () => {
		const seen: CompiledAppearance[] = [];
		const format: ExportFormatDefinition = {
			id: "probe",
			label: "Probe",
			extension: "txt",
			mimeType: "text/plain",
			run: async (_ir, _options, runCtx) => {
				const artifact = (
					runCtx as { compiledAppearance?: CompiledAppearance } | undefined
				)?.compiledAppearance;
				if (artifact !== undefined) seen.push(artifact);
				return { content: "", filename: "probe.txt" };
			},
		};
		await runExport({
			format,
			data: crossenvDocument,
			config: crossenvConfig,
			toIR: () =>
				({
					version: "1",
					root: { id: "root", type: "__root__", props: {} },
					assets: [],
					metadata: { createdAt: "2026-01-01T00:00:00.000Z" },
				}) as unknown as PageIR,
		});
		expect(seen[0]?.fingerprint).toBe(direct.fingerprint);
		expect(seen[0]?.css).toBe(direct.css);
	});

	it("overrides-path editor canvas: CanvasIframe mounts the compiled-appearance feed (structural — AutoFrame cannot ready in jsdom)", () => {
		const source = readFileSync(
			join(__dirname, "../../../react/overrides/canvas/CanvasIframe.tsx"),
			"utf8",
		);
		expect(source).toContain(
			'import { CompiledAppearanceMount } from "../../editor/composition/CompiledAppearanceMount.js";',
		);
		// The frame document goes with it: the feed marks that document's
		// root so the canvas identifies itself the way a production page
		// does (review 0036 L-6).
		expect(source).toContain(
			"<CompiledAppearanceMount document={iframeDoc} />",
		);
	});

	it("suppresses nothing: the wiring never mutates the document it styles", () => {
		const before = JSON.stringify(crossenvDocument);
		render(<AnvilKitRender config={crossenvConfig} data={crossenvDocument} />);
		expect(JSON.stringify(crossenvDocument)).toBe(before);
	});
});
