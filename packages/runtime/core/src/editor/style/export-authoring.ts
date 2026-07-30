/**
 * @file `buildExportAuthoring` — the one export-side authoring
 * consumer shared by every exporter (PLAN-0020 CORE-P2-012 / EP-17;
 * DD-0019 §23.1-§23.2; REVIEW-0019 P0).
 *
 * The authoring sidecar rides into {@link PageIR} on
 * `root.props.__anvilkit` (puckDataToIR copies root props verbatim
 * through canonicalization), so an export format can consume it with
 * no host wiring: read it with `readAuthoringState`, materialize
 * component instances through `materializeInstance` (§24.4
 * precedence, variants included), then materialize per-node CSS
 * through the single style-materialization path
 * (`buildExportStylesheet` → `resolveNodeAuthoring` →
 * `resolveAuthoringStyle`). Formats wrap styled nodes in a
 * `data-ak-node` element — the same wrapper `styleTarget` boundary
 * the editor preview applies, so preview and export bind styles to
 * the same box.
 *
 * Living in core rather than per-plugin is the point: two exporters
 * consuming two copies of this glue is a parity bug waiting to
 * happen, and exporter certification (DD-DEC-018) is only as strong
 * as the sameness of what each format consumes.
 *
 * Documents without authoring content return `undefined` and the
 * caller's legacy path stays byte-identical (DD-0019 §3.2).
 */

import type { ExportWarning, PageIR, PageIRNode } from "@anvilkit/contracts";
import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { Data } from "@puckeditor/core";
import type { MaterializeResult } from "../components/materialize.js";
import {
	formatComponentPath,
	materializeInstance,
} from "../components/materialize.js";
import { readAuthoringState } from "../read-write.js";
import type { ExportInstanceAuthoring } from "./export-stylesheet.js";
import { buildExportStylesheet } from "./export-stylesheet.js";

type MaterializedInstance = Extract<
	MaterializeResult,
	{ status: "materialized" }
>;
type PuckNode = MaterializedInstance["node"];

/** The materialized authoring channel for one export run. */
export interface ExportAuthoring {
	readonly authoring: AuthoringStateV1;
	/** Deterministic CSS to append after the format's own CSS. */
	readonly css: string;
	/** Node ids the format must wrap in `data-ak-node` elements. */
	readonly styledNodeIds: ReadonlySet<string>;
	/**
	 * Page node id → materialized replacement subtree. The format
	 * renders the replacement instead of the instance placeholder;
	 * materialized nodes carry their §14.2 runtime ids so instance
	 * override styles bind to them.
	 */
	readonly instances: ReadonlyMap<string, PageIRNode>;
	/** Resolution diagnostics mapped onto the ExportWarning channel. */
	readonly warnings: readonly ExportWarning[];
}

function hasAuthoringContent(state: AuthoringStateV1): boolean {
	return (
		state.breakpoints.length > 0 ||
		Object.keys(state.nodes).length > 0 ||
		Object.keys(state.tokens).length > 0 ||
		Object.keys(state.styleDefinitions).length > 0 ||
		Object.keys(state.componentDefinitions).length > 0
	);
}

function isPuckNode(value: unknown): value is PuckNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

/**
 * Convert a materialized Puck-shaped subtree into IR nodes an
 * emitter understands. Slot props (arrays of nodes) become
 * `children`; runtime ids stamped by `materializeInstance` become the
 * node ids the authored stylesheet targets.
 */
function convertPuckNode(node: PuckNode, fallbackId: string): PageIRNode {
	const props: Record<string, unknown> = {};
	const children: PageIRNode[] = [];
	for (const [key, value] of Object.entries(node.props)) {
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value.every((entry) => isPuckNode(entry))
		) {
			value.forEach((child, index) => {
				children.push({
					...convertPuckNode(child, `${fallbackId}.${key}.${index}`),
					slot: key,
				});
			});
			continue;
		}
		props[key] = value;
	}
	const id =
		typeof props.id === "string" && props.id !== "" ? props.id : fallbackId;
	return {
		id,
		type: node.type,
		props,
		...(children.length > 0 ? { children } : {}),
	};
}

function collectPresentNodeIds(node: PageIRNode, into: Set<string>): void {
	into.add(node.id);
	for (const child of node.children ?? []) {
		collectPresentNodeIds(child, into);
	}
}

interface MaterializedComponents {
	readonly instances: ReadonlyMap<string, PageIRNode>;
	readonly instanceAuthoring: ExportInstanceAuthoring;
	readonly warnings: readonly ExportWarning[];
}

/**
 * Materialize every component instance present in the IR (§24.4:
 * definition base → variant patch → exposed props → instance node
 * overrides → nested materialization). Failures degrade to warnings
 * and leave the placeholder node emitting as-is — the export still
 * completes, mirroring ED-COMP-007's retain-on-unresolvable rule.
 */
function materializeComponents(
	ir: PageIR,
	authoring: AuthoringStateV1,
): MaterializedComponents {
	const present = new Set<string>();
	collectPresentNodeIds(ir.root, present);

	const instances = new Map<string, PageIRNode>();
	const instanceAuthoring: Record<string, ExportInstanceAuthoring[string]> = {};
	const warnings: ExportWarning[] = [];

	for (const nodeId of Object.keys(authoring.nodes).sort()) {
		const instance = authoring.nodes[nodeId]?.componentInstance;
		if (instance === undefined || !present.has(nodeId)) {
			continue;
		}
		const result = materializeInstance(
			nodeId,
			instance,
			authoring.componentDefinitions,
		);
		if (result.status === "materialized") {
			instances.set(nodeId, convertPuckNode(result.node, `${nodeId}::root`));
			for (const [id, families] of Object.entries(result.authoring)) {
				instanceAuthoring[id] = families;
			}
			continue;
		}
		if (result.status === "missing-definition") {
			warnings.push({
				level: "warn",
				code: "EDITOR_DEFINITION_UNAVAILABLE",
				message:
					'Component definition "' +
					result.definitionId +
					'" is not in this document; the instance node exports without materialization.',
				nodeId,
			});
			continue;
		}
		warnings.push({
			level: "warn",
			code: "EDITOR_COMPONENT_CYCLE",
			message:
				(result.status === "cycle"
					? "Component materialization cycle: "
					: "Component nesting depth exceeded: ") +
				formatComponentPath(result.path, authoring.componentDefinitions) +
				"; the instance node exports without materialization.",
			nodeId,
		});
	}
	return { instances, instanceAuthoring, warnings };
}

/**
 * Read the authoring sidecar from an IR and materialize its styles
 * and component instances. Returns `undefined` for documents with no
 * authoring content — the legacy path — so callers can gate every
 * editor-aware branch on one check.
 */
export function buildExportAuthoring(ir: PageIR): ExportAuthoring | undefined {
	const read = readAuthoringState({
		root: { props: { ...ir.root.props } },
		content: [],
		zones: {},
	} as Data);
	if (!hasAuthoringContent(read.state)) {
		return undefined;
	}
	const components = materializeComponents(ir, read.state);
	const sheet = buildExportStylesheet({
		authoring: read.state,
		instanceAuthoring: components.instanceAuthoring,
	});
	const warnings: ExportWarning[] = [
		...components.warnings,
		...sheet.diagnostics.map(
			(diagnostic): ExportWarning => ({
				// Export proceeds — materialization degrades per property, so
				// even an `error`-severity diagnostic is advisory here.
				level: diagnostic.severity === "error" ? "error" : "warn",
				code: diagnostic.code,
				message: diagnostic.message,
				...(diagnostic.nodeIds?.[0] !== undefined
					? { nodeId: diagnostic.nodeIds[0] }
					: {}),
			}),
		),
	];
	return {
		authoring: read.state,
		css: sheet.css,
		styledNodeIds: sheet.styledNodeIds,
		instances: components.instances,
		warnings,
	};
}
