/**
 * @file `@anvilkit/ir/editor` — sidecar-aware IR projection and
 * export capability validation (PLAN-0020 CORE-P0-013; DD-0019
 * §23.1–§23.2; DD-DEC-004/-018/-020).
 *
 * ### Layering (v1.1 clarification)
 *
 * `ir` is a foundation package and cannot import `@anvilkit/core`
 * (foundation ← runtime is forbidden). Everything here therefore
 * operates on **parsed sidecars and pre-resolved models only**:
 * style materialization (`resolveAuthoringStyle`) and component
 * materialization live in `@anvilkit/core/editor` and are invoked by
 * the export pipeline (extensions/apps layer) *before* this module's
 * validation runs.
 *
 * ### Compatibility invariants
 *
 * PageIR version stays the literal `"1"`. Documents without authoring
 * state project to **reference-identical** IR — the legacy path is
 * byte-identical by construction. Per DD-DEC-020 the sidecar owns
 * `locked` and projects it one-way into `PageIRNode.meta.locked`;
 * the authoring `name` never enters PageIR.
 */

import type { PageIR, PageIRNode } from "@anvilkit/contracts";
import type {
	AuthoringStateV1,
	EditorError,
	EditorExportCapabilities,
	EditorFeatureId,
	ExportValidationResult,
} from "@anvilkit/contracts/editor";

function hasLockedRecords(authoring: AuthoringStateV1): boolean {
	return Object.values(authoring.nodes).some(
		(record) => record.locked === true,
	);
}

function projectNode(
	node: PageIRNode,
	lockedIds: ReadonlySet<string>,
): PageIRNode {
	const children = node.children;
	let nextChildren: readonly PageIRNode[] | undefined = children;
	if (children !== undefined) {
		let childChanged = false;
		const projected = children.map((child) => {
			const next = projectNode(child, lockedIds);
			if (next !== child) {
				childChanged = true;
			}
			return next;
		});
		nextChildren = childChanged ? projected : children;
	}
	const shouldLock = lockedIds.has(node.id) && node.meta?.locked !== true;
	if (!shouldLock && nextChildren === children) {
		return node;
	}
	return {
		...node,
		...(nextChildren !== children ? { children: nextChildren } : {}),
		...(shouldLock ? { meta: { ...node.meta, locked: true } } : {}),
	};
}

/**
 * Project sidecar-owned authoring facts into an already-converted
 * PageIR (DD-DEC-020): `locked` → `meta.locked`, one-way. Everything
 * else in the sidecar is either materialized upstream (styles,
 * components — by core/editor via the export pipeline) or carries no
 * IR representation. Pure; documents with no locked records return
 * the input IR **by reference** (legacy byte-identity).
 */
export function projectAuthoringToIR(
	ir: PageIR,
	authoring: AuthoringStateV1,
): PageIR {
	if (!hasLockedRecords(authoring)) {
		return ir;
	}
	const lockedIds = new Set(
		Object.entries(authoring.nodes)
			.filter(([, record]) => record.locked === true)
			.map(([nodeId]) => nodeId),
	);
	const root = projectNode(ir.root, lockedIds);
	return root === ir.root ? ir : { ...ir, root };
}

/**
 * Scan a parsed sidecar for used editor features (DD-0019 §23.2).
 *
 * Covers the seven sidecar-visible features. `richText` usage lives
 * in component props (the shared Tiptap contract), not the sidecar —
 * its detection ships with inline editing (Phase 1B) and until then
 * rich text continues to flow through the pre-editor exporter paths.
 */
export function listUsedAuthoringFeatures(
	authoring: AuthoringStateV1,
): readonly EditorFeatureId[] {
	const used: EditorFeatureId[] = [];
	const records = Object.values(authoring.nodes);
	const hasResponsiveOverride = records.some((record) =>
		(["hidden", "layout", "style", "typography", "styleRefs"] as const).some(
			(family) => {
				const value = record[family] as
					| { overrides?: Readonly<Record<string, unknown>> }
					| undefined;
				return (
					value?.overrides !== undefined &&
					Object.keys(value.overrides).length > 0
				);
			},
		),
	);
	if (authoring.breakpoints.length > 0 || hasResponsiveOverride) {
		used.push("responsive");
	}
	if (Object.keys(authoring.tokens).length > 0) {
		used.push("tokens");
	}
	if (Object.keys(authoring.styleDefinitions).length > 0) {
		used.push("styleDefinitions");
	}
	const hasInstances = records.some(
		(record) => record.componentInstance !== undefined,
	);
	if (Object.keys(authoring.componentDefinitions).length > 0 || hasInstances) {
		used.push("localComponents");
	}
	if (
		Object.values(authoring.componentDefinitions).some(
			(definition) =>
				definition.variantAxes.length > 0 || definition.variants.length > 0,
		)
	) {
		used.push("variants");
	}
	if (Object.keys(authoring.interactions).length > 0) {
		used.push("interactions");
	}
	if (Object.keys(authoring.bindings).length > 0) {
		used.push("bindings");
	}
	return used;
}

/** Options for {@link validateExportCapabilities}. */
export interface ValidateExportCapabilitiesOptions {
	/**
	 * `"production"` (default): unsupported features **block** export.
	 * `"development"`: preview may degrade — unsupported features
	 * produce a `"warning"` result with the same error entries.
	 */
	readonly mode?: "production" | "development";
}

/**
 * Compare used features against a format's declared capabilities
 * (DD-0019 §23.2; DD-DEC-018). A format without a declaration
 * declares **no** editor features: any used feature blocks
 * production export through it.
 */
export function validateExportCapabilities(
	usedFeatures: readonly EditorFeatureId[],
	capabilities: EditorExportCapabilities | undefined,
	options?: ValidateExportCapabilitiesOptions,
): ExportValidationResult {
	const supported = new Set(capabilities?.supportedFeatures ?? []);
	const unsupported = usedFeatures.filter((feature) => !supported.has(feature));
	if (unsupported.length === 0) {
		return { status: "passed", usedFeatures, errors: [] };
	}
	const production = options?.mode !== "development";
	const errors: readonly EditorError[] = unsupported.map((feature) => ({
		code: "EDITOR_EXPORTER_UNSUPPORTED",
		severity: production ? "error" : "warning",
		message:
			capabilities === undefined
				? `the selected export format declares no editor capabilities; the document uses "${feature}"`
				: `the selected export format does not support the "${feature}" feature`,
		recoverable: true,
		details: {
			feature,
			declared: capabilities !== undefined,
		},
	}));
	return {
		status: production ? "blocked" : "warning",
		usedFeatures,
		errors,
	};
}
