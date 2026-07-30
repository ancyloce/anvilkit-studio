/**
 * @file `buildExportStylesheet` — deterministic export-grade CSS for
 * authored documents (PLAN-0020 CORE-P2-012 / EP-17; DD-0019 §11.4,
 * §12.4, §23.1; REVIEW-0019 P0).
 *
 * The exporter-side counterpart of the preview authoring stylesheet:
 * one CSS text over `[data-ak-node]` selectors that an export format
 * embeds in its output. Unlike the preview channel (which layers raw
 * per-layer family deltas and leaves tokens to the editor runtime),
 * this builder resolves the **full §24.3 precedence** — component
 * defaults are host-side and out of scope, then attached style
 * definitions in list order, node base, style-definition breakpoint
 * overrides, node breakpoint overrides — with tokens substituted to
 * literals in a fixed mode, through the single materialization
 * implementation (`resolveNodeAuthoring` → `resolveAuthoringStyle`).
 *
 * ### Determinism (§12.4 shape, restated for export)
 *
 * - base rules first, then one `@media (max-width: …px)` block per
 *   enabled breakpoint in **descending** max-width order;
 * - within a layer, rules order by node id; properties serialize in
 *   the serializer's fixed application order;
 * - every emitted rule **fully restates** the node's resolved style
 *   at that layer, and a layer whose restatement is identical to the
 *   node's previous emitted layer is skipped — the wider block keeps
 *   applying through the cascade;
 * - identical input produces byte-identical CSS.
 *
 * ### Un-hiding across layers
 *
 * `hidden` compiles to `display: none`. A node hidden at a wider
 * layer and shown at a narrower one gets an explicit
 * `display: revert` when the narrower layer resolves no `display` of
 * its own — full restatement alone cannot retract a property that an
 * earlier block declared.
 */

import type {
	AuthoringStateV1,
	EditorError,
	NodeAuthoringStateV1,
	NodeOverridePatch,
} from "@anvilkit/contracts/editor";
import { resolveNodeAuthoring } from "../resolve/node.js";
import { resolveAuthoringStyle } from "./resolve-authoring-style.js";

/**
 * Authoring families for nodes that exist only in materialized
 * output — the `authoring` map `materializeInstance` returns, keyed
 * by runtime node id (`instance::definitionNode`).
 */
export type ExportInstanceAuthoring = Readonly<
	Record<string, Omit<NodeOverridePatch, "props">>
>;

/** Input to {@link buildExportStylesheet}. */
export interface ExportStylesheetInput {
	readonly authoring: AuthoringStateV1;
	/**
	 * Families for materialized-instance runtime nodes. Ids already
	 * present in `authoring.nodes` are never shadowed — runtime ids are
	 * output-only and cannot collide with persisted records (§14.2).
	 */
	readonly instanceAuthoring?: ExportInstanceAuthoring;
	/**
	 * The token mode baked into the export. Defaults to `"default"`,
	 * matching the preview resolver's fixed mode.
	 */
	readonly tokenMode?: string;
	/** Mode consulted on a missing value (§15.1 fallback). */
	readonly defaultTokenMode?: string;
}

/** The result of {@link buildExportStylesheet}. */
export interface ExportStylesheetResult {
	/** Deterministic CSS text; `""` when nothing is styled. */
	readonly css: string;
	/** Node ids that emitted at least one rule in any layer. */
	readonly styledNodeIds: ReadonlySet<string>;
	/** Deduplicated resolution diagnostics (unresolved tokens, …). */
	readonly diagnostics: readonly EditorError[];
}

/** Minimal attribute-value escape (quotes and backslashes). */
function cssEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** A viewport wider than any breakpoint: the base layer. */
const BASE_LAYER_WIDTH = Number.MAX_SAFE_INTEGER;

function syntheticRecord(
	families: Omit<NodeOverridePatch, "props">,
): NodeAuthoringStateV1 {
	return {
		version: "1",
		...(families.layout !== undefined ? { layout: families.layout } : {}),
		...(families.style !== undefined ? { style: families.style } : {}),
		...(families.typography !== undefined
			? { typography: families.typography }
			: {}),
		...(families.hidden !== undefined ? { hidden: families.hidden } : {}),
	};
}

/**
 * Build the deterministic export stylesheet for a document. Pure and
 * total: hostile or partially-invalid authoring degrades to
 * diagnostics, never a throw.
 */
export function buildExportStylesheet(
	input: ExportStylesheetInput,
): ExportStylesheetResult {
	const nodes: Record<string, NodeAuthoringStateV1> = {
		...input.authoring.nodes,
	};
	for (const [nodeId, families] of Object.entries(
		input.instanceAuthoring ?? {},
	)) {
		if (nodes[nodeId] === undefined) {
			nodes[nodeId] = syntheticRecord(families);
		}
	}
	const authoring: AuthoringStateV1 = { ...input.authoring, nodes };

	const enabled = [...authoring.breakpoints]
		.filter((breakpoint) => breakpoint.enabled)
		.sort((a, b) => b.maxWidth - a.maxWidth);
	const layers: readonly { readonly key: string; readonly width: number }[] = [
		{ key: "base", width: BASE_LAYER_WIDTH },
		...enabled.map((breakpoint) => ({
			key: breakpoint.id,
			width: breakpoint.maxWidth,
		})),
	];

	const nodeIds = Object.keys(nodes).sort();
	const styledNodeIds = new Set<string>();
	const diagnostics: EditorError[] = [];
	const seenDiagnostics = new Set<string>();
	const rulesByLayer = new Map<string, string[]>(
		layers.map((layer) => [layer.key, []]),
	);

	const addDiagnostics = (entries: readonly EditorError[]): void => {
		for (const entry of entries) {
			const key = `${entry.code}|${entry.message}|${(entry.nodeIds ?? []).join(",")}`;
			if (seenDiagnostics.has(key)) {
				continue;
			}
			seenDiagnostics.add(key);
			diagnostics.push(entry);
		}
	};

	for (const nodeId of nodeIds) {
		let lastEmittedBody: string | undefined;
		let lastEmittedHidden = false;
		for (const layer of layers) {
			const resolved = resolveNodeAuthoring(nodeId, {
				authoring,
				breakpoints: authoring.breakpoints,
				viewportWidth: layer.width,
				tokenMode: input.tokenMode ?? "default",
				...(input.defaultTokenMode !== undefined
					? { defaultTokenMode: input.defaultTokenMode }
					: {}),
			});
			addDiagnostics(resolved.diagnostics);
			const materialized = resolveAuthoringStyle({
				nodeId,
				layout: resolved.layout,
				style: resolved.style,
				typography: resolved.typography,
				hidden: resolved.hidden,
			});
			addDiagnostics(materialized.diagnostics);

			const entries = Object.entries(materialized.inlineStyle);
			if (
				lastEmittedHidden &&
				!resolved.hidden &&
				materialized.inlineStyle.display === undefined
			) {
				entries.push(["display", "revert"]);
			}
			const body = entries
				.map(([property, value]) => `${property}: ${String(value)};`)
				.join(" ");
			if (body === "" && lastEmittedBody === undefined) {
				continue;
			}
			if (body === lastEmittedBody) {
				continue;
			}
			if (body === "") {
				// Nothing resolves at this layer and nothing was retracted —
				// the wider emitted rule keeps applying; do not emit.
				continue;
			}
			rulesByLayer
				.get(layer.key)
				?.push(`[data-ak-node="${cssEscape(nodeId)}"] { ${body} }`);
			styledNodeIds.add(nodeId);
			lastEmittedBody = body;
			lastEmittedHidden = resolved.hidden;
		}
	}

	const parts: string[] = [...(rulesByLayer.get("base") ?? [])];
	for (const breakpoint of enabled) {
		const rules = rulesByLayer.get(breakpoint.id) ?? [];
		if (rules.length === 0) {
			continue;
		}
		parts.push(
			`@media (max-width: ${breakpoint.maxWidth}px) { ${rules.join(" ")} }`,
		);
	}

	return { css: parts.join("\n"), styledNodeIds, diagnostics };
}
