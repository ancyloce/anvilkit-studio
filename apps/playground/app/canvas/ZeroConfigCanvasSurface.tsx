"use client";

import type { CanvasIR } from "@anvilkit/canvas-core";
import { createCanvasIR, createPage } from "@anvilkit/canvas-core";
import {
	CanvasWorkspace,
	createCanvasExportPlugin,
	useCanvasStudio,
} from "@anvilkit/canvas-editor";
import { type ReactElement, useCallback, useMemo, useState } from "react";

import "@anvilkit/canvas-editor/styles.css";

/**
 * PLAN-0035 `cp6-004` — the ZERO-CONFIGURATION canvas harness.
 *
 * The program's thesis is that a third party can embed the canvas editor and
 * complete a design without wiring anything. `apps/studio` cannot test that:
 * it wires an uploader, an asset picker, a brand kit, templates, persistence,
 * recovery and the export plugin, so its whole E2E suite stays green even if
 * the zero-config path is broken. This surface is the counter-example — it
 * passes `<CanvasWorkspace>` NO adapter props at all:
 *
 *   no `assetUploader`      no `assetPicker`       no `onPickAsset`
 *   no `brandKit`           no `fontCatalog`       no `templates`
 *   no `persistenceAdapter` no `recoveryAdapter`   no `elementProvider`
 *
 * `<CanvasWorkspace>` rather than the bare `<CanvasStudio>` for one reason
 * only: `CanvasStudio` is headless by design (`renderShell` absent renders a
 * raw Konva stage and nothing else), and `CanvasWorkspace` is documented as
 * "the editor's single top-level shell". It forwards every prop it does not
 * own straight through, so this IS a bare `<CanvasStudio initialIR={blank} />`
 * plus the default chrome — which is what "a third party embeds the editor"
 * means in practice.
 *
 * THREE THINGS HERE ARE NOT EDITOR CONFIGURATION, and each is deliberate:
 *
 * 1. **Document persistence** (`localStorage`). The host owns the document —
 *    `initialIR` is a host input and `onChange` is a host output, exactly as
 *    a controlled React component. Nothing about the editor is configured by
 *    it. It exists so the reload leg has a document to come back to, which is
 *    the precondition for testing `cp1-005`'s object-URL rehydration: the
 *    saved IR keeps its dead `blob:` URIs and the editor must re-mint them
 *    from its own IndexedDB store.
 * 2. **The hidden scene readout.** Test instrumentation, mirroring
 *    `apps/studio`'s `HostSceneReadout`. It reads state, never writes it.
 * 3. **`headerPlugins={[createCanvasExportPlugin()]}`, behind `?export=1`.**
 *    This is the one genuine piece of configuration, and it is opt-in
 *    precisely so the suite can assert what happens WITHOUT it — see
 *    `zero-config-canvas.spec.ts`'s "no export affordance" test. The built-in
 *    plugin takes no options and injects no serializers; `CanvasWorkspace`
 *    simply does not mount it by default.
 *
 * Every import above is a PUBLISHED entry point (`@anvilkit/canvas-core`,
 * `@anvilkit/canvas-editor`, `@anvilkit/canvas-editor/styles.css`). This app
 * declares no source aliases and no `transpilePackages`, so a symbol that only
 * works through a source path fails here.
 */

/** Namespaces the host-owned document copy; suffixed by the `?doc=` param. */
const STORAGE_PREFIX = "anvilkit-playground-zero-config-canvas:";

function readParams(): { doc: string; exportEnabled: boolean } {
	if (typeof window === "undefined") {
		return { doc: "default", exportEnabled: false };
	}
	const params = new URLSearchParams(window.location.search);
	return {
		doc: params.get("doc") ?? "default",
		exportEnabled: params.get("export") === "1",
	};
}

function loadOrCreateIR(doc: string): CanvasIR {
	const key = `${STORAGE_PREFIX}${doc}`;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw) return JSON.parse(raw) as CanvasIR;
	} catch {
		// A corrupt or unreadable entry is not worth reporting to the user; a
		// fresh blank document is the only useful recovery here.
	}
	return createCanvasIR({
		id: doc,
		title: doc,
		pages: [createPage({ id: doc, name: doc })],
	});
}

/**
 * Machine-readable scene readout, rendered INSIDE the studio provider through
 * `<CanvasWorkspace>`'s `children` slot. Assertions read this off the DOM
 * rather than reaching into Konva.
 *
 * `assets` carries the URI SCHEME rather than the URI: an object URL is
 * per-tab and per-mint, so its value is noise, while its scheme is exactly the
 * fact `cp1-005` is about (a persisted `blob:` URI is dead after a reload and
 * has to be re-minted from the local store).
 */
function SceneReadout(): ReactElement {
	const ctx = useCanvasStudio();
	const page = ctx.ir.pages.find((p) => p.id === ctx.activePageId);
	const nodes = page ? page.root.children : [];
	const scene = JSON.stringify({
		count: nodes.length,
		activePageId: ctx.activePageId,
		nodes: nodes.map((n) => ({
			id: n.id,
			type: n.type,
			x: n.transform.x,
			y: n.transform.y,
			width: n.bounds.width,
			height: n.bounds.height,
			text: n.type === "text" ? n.text : undefined,
			fontFamily: n.type === "text" ? n.fontFamily : undefined,
			fill: "fill" in n ? n.fill : undefined,
			assetId: n.type === "image" ? n.assetId : undefined,
		})),
		assets: Object.values(ctx.ir.assets).map((a) => ({
			id: a.id,
			scheme: a.uri.slice(0, Math.max(0, a.uri.indexOf(":"))),
		})),
	});
	return (
		<div data-testid="zero-config-host-ui">
			<span data-testid="zero-config-node-count">{nodes.length}</span>
			<pre data-testid="zero-config-ir-debug">{scene}</pre>
		</div>
	);
}

export default function ZeroConfigCanvasSurface(): ReactElement {
	const [{ doc, exportEnabled }] = useState(readParams);
	const [initialIR] = useState(() => loadOrCreateIR(doc));

	// Host-owned document persistence. `onChange` fires per committed command,
	// so this is the same "the host holds the document" contract every embed
	// has; the editor is told nothing about storage.
	const onChange = useCallback(
		(ir: CanvasIR) => {
			try {
				window.localStorage.setItem(
					`${STORAGE_PREFIX}${doc}`,
					JSON.stringify(ir),
				);
			} catch {
				// Quota or private-mode failures must not break editing.
			}
		},
		[doc],
	);

	const headerPlugins = useMemo(
		() => (exportEnabled ? [createCanvasExportPlugin()] : undefined),
		[exportEnabled],
	);

	return (
		<CanvasWorkspace
			initialIR={initialIR}
			onChange={onChange}
			{...(headerPlugins ? { headerPlugins } : {})}
		>
			<SceneReadout />
		</CanvasWorkspace>
	);
}
