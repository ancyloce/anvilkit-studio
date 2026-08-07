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
	Binding,
	BreakpointDefinition,
	ComponentDefinition,
	DesignToken,
	EditorError,
	EditorExportCapabilities,
	EditorFeatureId,
	ExportValidationResult,
	Interaction,
	NodeAuthoringStateV1,
	StyleDefinition,
	TokenMode,
} from "@anvilkit/contracts/editor";

/**
 * The sidecar envelope this scanner reads, declared locally.
 *
 * `p1-005` moved the sidecar contract out of published
 * `@anvilkit/contracts` into `@anvilkit/core`'s internals. `ir` is a
 * FOUNDATION package and must not import from a runtime one — the
 * dependency direction is `apps → extensions → capabilities → runtime
 * → foundation` — so it carries its own view, mirroring the original
 * shape and reusing the member contracts that are still published.
 * `p2-007` rewrites this module onto `DocumentModel` and deletes this
 * with it.
 */
interface AuthoringStateV1 {
	readonly version: "1";
	readonly revision: number;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly nodes: Readonly<Record<string, NodeAuthoringStateV1>>;
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly tokenModes: Readonly<Record<string, TokenMode>>;
	readonly styleDefinitions: Readonly<Record<string, StyleDefinition>>;
	readonly componentDefinitions: Readonly<Record<string, ComponentDefinition>>;
	readonly interactions: Readonly<Record<string, Interaction>>;
	readonly bindings: Readonly<Record<string, Binding>>;
}

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
 * A structural view of an authored document, sufficient for
 * prop-level feature detection.
 *
 * Deliberately **not** Puck's `Data`: `@anvilkit/ir` is a foundation
 * package with no runtime Puck import (§30.5 as read per C-6). The
 * fields are widened to `unknown` so that both shapes a caller can
 * hold are assignable without a cast — Puck `Data`
 * (`root.props` / `content` / `zones`) and `PageIR`
 * (`root.children`) — and the scan itself walks the whole object
 * rather than a fixed field list, so a future container cannot
 * silently hide rich text from the gate.
 */
export interface EditorFeatureScanDocument {
	readonly root?: unknown;
	readonly content?: readonly unknown[];
	readonly zones?: unknown;
}

/**
 * True for a value written by the shared rich-text pipeline.
 *
 * The check is exact rather than heuristic: `sanitizeTiptapDocument`
 * is the only writer of inline rich text and it *always* emits
 * `{ version: "1", type: "doc", content: [...] }`, so requiring all
 * three fields cannot miss an editor-authored document and cannot
 * mistake a bare Tiptap/ProseMirror JSON blob (no `version`) or an
 * arbitrary prop for one. Puck's own `richtext` field stores an HTML
 * **string** and is correctly not matched — it is a pre-editor feature
 * that every exporter already handles.
 */
function isTiptapDocumentValue(value: unknown): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as {
		version?: unknown;
		type?: unknown;
		content?: unknown;
	};
	return (
		candidate.version === "1" &&
		candidate.type === "doc" &&
		Array.isArray(candidate.content)
	);
}

/**
 * Depth-limited search for a Tiptap document anywhere inside a JSON
 * value. The bound exists so a pathological document cannot turn
 * preflight into an unbounded walk; 64 is far past any real prop tree
 * (Puck slot nesting is limited by the editor's own depth caps).
 */
function containsTiptapDocument(value: unknown, depth = 0): boolean {
	if (depth > 64) {
		return false;
	}
	if (isTiptapDocumentValue(value)) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some((entry) => containsTiptapDocument(entry, depth + 1));
	}
	if (typeof value === "object" && value !== null) {
		return Object.values(value as Record<string, unknown>).some((entry) =>
			containsTiptapDocument(entry, depth + 1),
		);
	}
	return false;
}

/**
 * Every prop bag reachable from a document, sidecar included.
 *
 * Component **definitions** are scanned too: a definition captured
 * from a rich-text node holds that node's props in its `root`, and an
 * instance's `propOverrides` / `nodeOverrides` can reintroduce rich
 * text that the page tree never shows directly.
 */
function* scanRoots(
	authoring: AuthoringStateV1,
	document: EditorFeatureScanDocument | null | undefined,
): Generator<unknown> {
	if (document != null) {
		// The whole document, not a field list: Puck `Data`, PageIR, and
		// any future container all get scanned by the same walk. Passing
		// over the sidecar on `root.props.__anvilkit` is harmless — the
		// sidecar's own definitions are scanned below anyway, and the
		// walk short-circuits on the first match.
		yield document;
	}
	for (const definition of Object.values(authoring.componentDefinitions)) {
		yield definition.root;
	}
	for (const record of Object.values(authoring.nodes)) {
		const instance = record.componentInstance;
		if (instance !== undefined) {
			yield instance.propOverrides;
			yield instance.nodeOverrides;
		}
	}
}

/**
 * Scan a document and its sidecar for every used editor feature
 * (DD-0019 §23.2; DD-DEC-018).
 *
 * This is the **complete** scanner and the one every production
 * preflight call site must use. {@link listUsedAuthoringFeatures} is
 * kept as the sidecar-only view for callers that genuinely have no
 * document (see its own note).
 *
 * Feature coverage, one line per `EditorFeatureId`:
 *
 * | feature | detected from |
 * |---|---|
 * | `responsive` | declared breakpoints, or any per-node responsive override |
 * | `tokens` | sidecar token definitions, or any live token reference |
 * | `styleDefinitions` | sidecar definitions, or any node `styleRefs` |
 * | `localComponents` | sidecar definitions, or any node `componentInstance` |
 * | `variants` | definition axes/variants, or any instance `variantSelection` |
 * | `interactions` | sidecar interactions, or any node `interactionRefs` |
 * | `bindings` | sidecar bindings, or any node `bindingRefs` |
 * | `richText` | a `TiptapDocument` in component props, definition roots, or instance overrides |
 *
 * The dangling-reference arms (a node referencing a definition that
 * the sidecar no longer holds) matter: they are exactly the states a
 * partially-edited document reaches, and treating them as "unused"
 * would let a document escape the production block.
 *
 * Output order is stable and matches the `EditorFeatureId` union
 * declaration order, so callers may compare results directly.
 */
export function listUsedEditorFeatures(
	authoring: AuthoringStateV1,
	document?: EditorFeatureScanDocument | null,
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

	if (
		Object.keys(authoring.tokens).length > 0 ||
		Object.keys(authoring.tokenModes).length > 0 ||
		records.some(referencesToken)
	) {
		used.push("tokens");
	}

	const hasStyleRefs = records.some((record) => {
		const refs = record.styleRefs;
		if (refs === undefined) return false;
		return (
			(refs.base?.length ?? 0) > 0 ||
			Object.values(refs.overrides ?? {}).some(
				(value) => (value?.length ?? 0) > 0,
			)
		);
	});
	if (Object.keys(authoring.styleDefinitions).length > 0 || hasStyleRefs) {
		used.push("styleDefinitions");
	}

	const instances = records
		.map((record) => record.componentInstance)
		.filter((instance) => instance !== undefined);
	if (
		Object.keys(authoring.componentDefinitions).length > 0 ||
		instances.length > 0
	) {
		used.push("localComponents");
	}

	if (
		Object.values(authoring.componentDefinitions).some(
			(definition) =>
				definition.variantAxes.length > 0 || definition.variants.length > 0,
		) ||
		instances.some(
			(instance) => Object.keys(instance.variantSelection).length > 0,
		)
	) {
		used.push("variants");
	}

	if (
		Object.keys(authoring.interactions).length > 0 ||
		records.some((record) => (record.interactionRefs?.length ?? 0) > 0)
	) {
		used.push("interactions");
	}

	if (
		Object.keys(authoring.bindings).length > 0 ||
		records.some((record) => (record.bindingRefs?.length ?? 0) > 0)
	) {
		used.push("bindings");
	}

	for (const root of scanRoots(authoring, document)) {
		if (containsTiptapDocument(root)) {
			used.push("richText");
			break;
		}
	}

	return used;
}

/**
 * True when any authored value under `value` is a token reference.
 *
 * Token references are the `{ kind: "token", tokenId }` members of
 * `CssLength` / `CssColor` / `CssMathExpression` (§9.3). Scanning
 * generically rather than enumerating spec fields means a newly
 * tokenizable property cannot silently escape detection — the same
 * reason `@anvilkit/core/editor`'s token walk is one traversal rather
 * than a per-field list.
 */
function referencesToken(value: unknown, depth = 0): boolean {
	if (depth > 64) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.some((entry) => referencesToken(entry, depth + 1));
	}
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as { kind?: unknown; tokenId?: unknown };
	if (
		candidate.kind === "token" &&
		typeof candidate.tokenId === "string" &&
		candidate.tokenId.length > 0
	) {
		return true;
	}
	return Object.values(value as Record<string, unknown>).some((entry) =>
		referencesToken(entry, depth + 1),
	);
}

/**
 * Scan a parsed sidecar for used editor features (DD-0019 §23.2).
 *
 * **Partial by construction — not for production preflight.** This
 * sees only what the sidecar holds, so `richText` (which lives in
 * component props) is invisible to it. It is retained because it is
 * public API and because sidecar-only callers exist that legitimately
 * have no document in hand; every export gate uses
 * {@link listUsedEditorFeatures} instead.
 *
 * @deprecated Prefer {@link listUsedEditorFeatures}, which takes the
 * document as an optional second argument and detects every
 * `EditorFeatureId`.
 */
export function listUsedAuthoringFeatures(
	authoring: AuthoringStateV1,
): readonly EditorFeatureId[] {
	return listUsedEditorFeatures(authoring);
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
