/**
 * @file `migrateToPuckNativeV2` — the ONE-time pure v1→v2 document
 * migration (PLAN-0025 §10.2, P5-01).
 *
 * Converts a legacy sidecar document (`root.props.__anvilkit`,
 * PLAN-0020 model) into the Puck-native v2 model: per-node §5.1
 * carriers (`appearance`/`interactions`/`bindings` on component
 * props) plus §5.2 root props (`designSystem`/`componentLibrary`/
 * `authoringSchemaVersion: 2`). §10.1 principles enforced here:
 *
 * - **Pure** — no I/O, no clock, no randomness; same input, same
 *   output. Storage, snapshots, and CAS live in the CLI (P5-02).
 * - **Idempotent** — a migrated document returns `already-v2`.
 * - **All-or-nothing** — any error-severity diagnostic returns
 *   `blocked` with NO data: the original document stays untouched,
 *   sidecar included (never partially migrated).
 * - **Never guess** — legacy single-target node state maps to the
 *   component's declared `root` target (§10.2 step 5); a component
 *   without a v2 `root` target declaration blocks with an
 *   unknown-target diagnostic. No heuristic target assignment.
 *
 * Token-mode decision (recorded): the persisted v1 model has NO
 * default token mode — it was host configuration
 * (`StudioEditorConfig.defaultTokenMode`), and the legacy export
 * pipeline baked `"default"` when unset (`export-stylesheet.ts`).
 * Migration therefore stamps `designSystem.defaultTokenMode =
 * options.defaultTokenMode ?? "default"`, mirroring what production
 * exports actually did; the §10.2 step-11 parity gate compiles both
 * pipelines under that same mode, so the choice is parity-checked,
 * not trusted.
 *
 * The v1→v2 node conversion (`legacyNodeToAppearance`) and the CSS
 * normalization (`normalizeCssForParity`) are the SAME logic the
 * P1-06 legacy-golden parity suite proved against committed goldens —
 * lifted here so exactly one conversion exists.
 */

import type {
	AnvilAppearance,
	AuthorStyle,
	Binding,
	DesignSystem,
	DocumentComponentLibrary,
	Interaction,
	NodeAuthoringStateV1,
} from "@anvilkit/contracts/editor";
import {
	ANVILKIT_AUTHORING_KEY,
	readLegacySidecar,
} from "./legacy-sidecar.js";
import type { Config, Data } from "@puckeditor/core";
import { migrate, transformProps, walkTree } from "@puckeditor/core";
import { readEditorMetadataFor } from "../puck/component-metadata.js";
import { compileDocumentAppearance } from "../style-compiler/compile.js";

/** One migration diagnostic. Module-owned (plan §10.2 shape). */
export interface MigrationDiagnostic {
	readonly code:
		| "MIGRATION_SIDECAR_UNREADABLE"
		| "MIGRATION_PUCK_MIGRATE_FAILED"
		| "MIGRATION_UNKNOWN_COMPONENT"
		| "MIGRATION_UNKNOWN_TARGET"
		| "MIGRATION_DUPLICATE_NODE_ID"
		| "MIGRATION_ORPHAN_NODE_STATE"
		| "MIGRATION_ORPHAN_INTERACTION"
		| "MIGRATION_ORPHAN_BINDING"
		| "MIGRATION_TOKEN_CYCLE"
		| "MIGRATION_PARITY_MISMATCH"
		| "MIGRATION_ASSUMED_TOKEN_MODE";
	readonly severity: "info" | "warning" | "error";
	readonly message: string;
	readonly nodeIds?: readonly string[];
	readonly details?: Readonly<Record<string, unknown>>;
}

/** Plan §10.2 result contract, verbatim. */
export interface MigrationResult {
	readonly status: "migrated" | "already-v2" | "blocked";
	readonly data?: Data;
	readonly diagnostics: readonly MigrationDiagnostic[];
	readonly report: {
		readonly visitedNodes: number;
		readonly migratedNodes: number;
		readonly orphanNodeStates: readonly string[];
		readonly unknownComponentTypes: readonly string[];
		readonly unknownTargets: readonly string[];
	};
}

export interface MigrateToPuckNativeV2Options {
	/**
	 * The mode stamped as `designSystem.defaultTokenMode`. Defaults to
	 * `"default"` — the mode the legacy export pipeline baked (see the
	 * file doc). Parity-checked either way.
	 */
	readonly defaultTokenMode?: string;
}

/**
 * v2 appearance derived from one legacy node record (P1-06-proven
 * conversion): the three v1 spec families fold into layered
 * `AuthorStyle` values on the `root` target; `styleRefs` and
 * `hidden` carry over shape-identical.
 */
export function legacyNodeToAppearance(
	record: NodeAuthoringStateV1,
): AnvilAppearance | undefined {
	const layers = new Set<string>(["base"]);
	for (const family of [record.layout, record.style, record.typography]) {
		for (const key of Object.keys(family?.overrides ?? {})) layers.add(key);
	}
	const styleAt = (layer: string): AuthorStyle | undefined => {
		const pick = <T>(
			family:
				| { base?: T; overrides?: Readonly<Record<string, T | null>> }
				| undefined,
		): T | undefined => {
			if (family === undefined) return undefined;
			if (layer === "base") return family.base;
			const entry = family.overrides?.[layer];
			return entry === null ? undefined : entry;
		};
		const layout = pick(record.layout);
		const visual = pick(record.style);
		const typography = pick(record.typography);
		if (
			layout === undefined &&
			visual === undefined &&
			typography === undefined
		) {
			return undefined;
		}
		return {
			...(layout !== undefined ? { layout } : {}),
			...(visual !== undefined ? { visual } : {}),
			...(typography !== undefined ? { typography } : {}),
		};
	};
	const base = styleAt("base");
	const overrides: Record<string, AuthorStyle> = {};
	for (const layer of layers) {
		if (layer === "base") continue;
		const value = styleAt(layer);
		if (value !== undefined) overrides[layer] = value;
	}
	const hasStyle = base !== undefined || Object.keys(overrides).length > 0;
	if (
		!hasStyle &&
		record.styleRefs === undefined &&
		record.hidden === undefined
	) {
		// Canonicalization: an empty shell is never stored (§5.1).
		return undefined;
	}
	return {
		targets: {
			root: {
				...(hasStyle
					? {
							style: {
								...(base !== undefined ? { base } : {}),
								...(Object.keys(overrides).length > 0 ? { overrides } : {}),
							},
						}
					: {}),
				...(record.styleRefs !== undefined
					? { styleRefs: record.styleRefs }
					: {}),
				...(record.hidden !== undefined ? { hidden: record.hidden } : {}),
			},
		},
	};
}

/**
 * Parse CSS text into `nodeId → layer → sorted declaration set` —
 * selector-shape-agnostic (v1 `[data-ak-node]` and v2 attribute pairs
 * normalize identically). The P1-06 parity representation.
 */
export function normalizeCssForParity(
	css: string,
): Record<string, Record<string, string[]>> {
	const out: Record<string, Record<string, string[]>> = {};
	const addRules = (layer: string, text: string): void => {
		for (const match of text.matchAll(/(\[[^{]+\])\s*\{\s*([^}]*?)\s*\}/g)) {
			const selector = match[1] ?? "";
			const nodeId =
				/data-ak-(?:style-)?node="([^"]+)"/.exec(selector)?.[1] ?? selector;
			const declarations = (match[2] ?? "")
				.split(";")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
				.sort();
			((out[nodeId] ??= {})[layer] ??= []).push(...declarations);
			(out[nodeId] as Record<string, string[]>)[layer] = [
				...new Set((out[nodeId] as Record<string, string[]>)[layer]),
			].sort();
		}
	};
	for (const line of css.split("\n")) {
		const media = /^@media \(max-width: (\d+)px\) \{ (.*) \}$/.exec(line);
		if (media !== null) {
			addRules(`max-${media[1]}`, media[2] ?? "");
		} else {
			addRules("base", line);
		}
	}
	return out;
}

interface LiveNode {
	readonly id: string;
	readonly type: string;
}

/** Collect every component node (content + slots) after Puck migrate. */
function collectLiveNodes(data: Data, config: Config): LiveNode[] {
	const nodes: LiveNode[] = [];
	walkTree(data, config, (content) => {
		for (const item of content) {
			const id = (item.props as { id?: unknown } | undefined)?.id;
			nodes.push({
				id: typeof id === "string" ? id : "",
				type: String(item.type),
			});
		}
	});
	return nodes;
}

/** Detect alias cycles per token per mode (§10.2 step 10). */
function findTokenCycles(tokens: DesignSystem["tokens"]): readonly string[] {
	const cyclic: string[] = [];
	for (const [tokenId, token] of Object.entries(tokens)) {
		for (const value of Object.values(token.values ?? {})) {
			let current = value as { kind?: string; tokenId?: string };
			const seen = new Set<string>([tokenId]);
			let hops = 0;
			while (current?.kind === "alias" && current.tokenId !== undefined) {
				if (seen.has(current.tokenId) || hops > 16) {
					cyclic.push(tokenId);
					break;
				}
				seen.add(current.tokenId);
				hops += 1;
				const next = tokens[current.tokenId];
				if (next === undefined) break;
				const nextValue = Object.values(next.values ?? {})[0];
				current = nextValue as { kind?: string; tokenId?: string };
			}
		}
	}
	return [...new Set(cyclic)];
}

/**
 * Run the one-time migration. See the file doc for the guarantees;
 * see plan §10.2 for the numbered algorithm the implementation
 * follows step by step.
 */
export function migrateToPuckNativeV2(
	data: Data,
	baseConfig: Config,
	options?: MigrateToPuckNativeV2Options,
): MigrationResult {
	const diagnostics: MigrationDiagnostic[] = [];
	const emptyReport = {
		visitedNodes: 0,
		migratedNodes: 0,
		orphanNodeStates: [] as string[],
		unknownComponentTypes: [] as string[],
		unknownTargets: [] as string[],
	};

	// Step 1 — Puck's official migrate() first: legacy root/DropZone
	// structures normalize into the current Data/slot model (raw legacy
	// zones are invisible to walkTree until this runs).
	let normalized: Data;
	try {
		normalized = migrate(structuredCloneData(data), baseConfig);
	} catch (error) {
		return blocked(diagnostics, emptyReport, {
			code: "MIGRATION_PUCK_MIGRATE_FAILED",
			severity: "error",
			message: `Puck migrate() rejected the document: ${
				error instanceof Error ? error.message : String(error)
			}`,
		});
	}

	// Step 2 — strict sidecar parse via the ONE sanctioned reader.
	const rootProps = (normalized.root?.props ?? {}) as Record<string, unknown>;
	const sidecarPresent = rootProps[ANVILKIT_AUTHORING_KEY] !== undefined;
	const read = readLegacySidecar(normalized);
	if (sidecarPresent && read.readOnly) {
		return blocked(diagnostics, emptyReport, {
			code: "MIGRATION_SIDECAR_UNREADABLE",
			severity: "error",
			message:
				"The __anvilkit sidecar failed strict parsing (invalid or unsupported major version); the document must stay legacy/read-only.",
			details: { errors: read.errors },
		});
	}
	if (!sidecarPresent && rootProps.authoringSchemaVersion === 2) {
		return {
			status: "already-v2",
			diagnostics,
			report: emptyReport,
		};
	}
	const state = read.state;

	// Step 3 — node-id → legacy record index.
	const legacyNodes = state.nodes;

	// Steps 4/10 (walk) — live nodes, duplicate ids, unknown types.
	const liveNodes = collectLiveNodes(normalized, baseConfig);
	const visitedNodes = liveNodes.length;
	const liveIds = new Set<string>();
	const duplicates = new Set<string>();
	for (const node of liveNodes) {
		if (node.id === "") continue;
		if (liveIds.has(node.id)) duplicates.add(node.id);
		liveIds.add(node.id);
	}
	for (const id of duplicates) {
		diagnostics.push({
			code: "MIGRATION_DUPLICATE_NODE_ID",
			severity: "error",
			message: `Duplicate node id "${id}" — carrier ownership would be ambiguous.`,
			nodeIds: [id],
		});
	}
	const unknownComponentTypes = [
		...new Set(
			liveNodes
				.filter(
					(node) => (baseConfig.components ?? {})[node.type] === undefined,
				)
				.map((node) => node.type),
		),
	];
	for (const type of unknownComponentTypes) {
		diagnostics.push({
			code: "MIGRATION_UNKNOWN_COMPONENT",
			severity: "error",
			message: `Component type "${type}" is not in the config — its nodes cannot declare v2 carriers.`,
		});
	}

	// Step 5 — target mapping: legacy single-target state → declared
	// `root` target. Missing v2 root declaration = unknown target.
	const typeById = new Map<string, string>();
	for (const node of liveNodes) {
		if (node.id !== "") typeById.set(node.id, node.type);
	}
	const unknownTargets: string[] = [];
	for (const nodeId of Object.keys(legacyNodes)) {
		const type = typeById.get(nodeId);
		if (type === undefined) continue; // orphan — handled below
		if (unknownComponentTypes.includes(type)) continue; // already fatal
		const metadata = readEditorMetadataFor(baseConfig, type);
		if (metadata?.styleTargets.root === undefined) {
			const entry = `${type}#root`;
			if (!unknownTargets.includes(entry)) unknownTargets.push(entry);
			diagnostics.push({
				code: "MIGRATION_UNKNOWN_TARGET",
				severity: "error",
				message: `Component "${type}" declares no v2 root style target; legacy node state for "${nodeId}" has no declared destination (never guessed — §10.2 step 5).`,
				nodeIds: [nodeId],
			});
		}
	}

	// Step 10 — orphan node states (sidecar records with no live node).
	const orphanNodeStates = Object.keys(legacyNodes).filter(
		(nodeId) => !liveIds.has(nodeId),
	);
	for (const nodeId of orphanNodeStates) {
		diagnostics.push({
			code: "MIGRATION_ORPHAN_NODE_STATE",
			severity: "warning",
			message: `Legacy node state for "${nodeId}" has no matching node in the tree; it will be dropped (recorded, not silently).`,
			nodeIds: [nodeId],
		});
	}

	// Step 6 — §5.1 ownership: interactions to their trigger node,
	// bindings to their bound node. Orphans reported.
	const interactionsByNode = new Map<string, Interaction[]>();
	for (const interaction of Object.values(state.interactions)) {
		const owner = interaction.sourceNodeId;
		if (!liveIds.has(owner)) {
			diagnostics.push({
				code: "MIGRATION_ORPHAN_INTERACTION",
				severity: "warning",
				message: `Interaction "${interaction.id}" triggers on missing node "${owner}"; dropped as an orphan.`,
				nodeIds: [owner],
			});
			continue;
		}
		const list = interactionsByNode.get(owner) ?? [];
		list.push(interaction);
		interactionsByNode.set(owner, list);
	}
	const bindingsByNode = new Map<string, Binding[]>();
	for (const binding of Object.values(state.bindings)) {
		const owner = binding.nodeId;
		if (!liveIds.has(owner)) {
			diagnostics.push({
				code: "MIGRATION_ORPHAN_BINDING",
				severity: "warning",
				message: `Binding "${binding.id}" binds missing node "${owner}"; dropped as an orphan.`,
				nodeIds: [owner],
			});
			continue;
		}
		const list = bindingsByNode.get(owner) ?? [];
		list.push(binding);
		bindingsByNode.set(owner, list);
	}

	// Step 10 — token alias cycles.
	for (const tokenId of findTokenCycles(state.tokens)) {
		diagnostics.push({
			code: "MIGRATION_TOKEN_CYCLE",
			severity: "error",
			message: `Token "${tokenId}" participates in an alias cycle.`,
		});
	}

	// Fail closed BEFORE building any output (§10.1 all-or-nothing).
	if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
		return blocked(diagnostics, {
			...emptyReport,
			visitedNodes,
			orphanNodeStates,
			unknownComponentTypes,
			unknownTargets,
		});
	}

	// Steps 4+6 — one transformProps pass writes every §5.1 carrier.
	let migratedNodes = 0;
	const transforms = Object.fromEntries(
		Object.keys(baseConfig.components ?? {}).map((type) => [
			type,
			(props: Record<string, unknown>) => {
				const id = typeof props.id === "string" ? props.id : "";
				const legacy = legacyNodes[id];
				const appearance =
					legacy === undefined ? undefined : legacyNodeToAppearance(legacy);
				const interactions = interactionsByNode.get(id);
				const bindings = bindingsByNode.get(id);
				if (
					appearance === undefined &&
					interactions === undefined &&
					bindings === undefined
				) {
					return props;
				}
				migratedNodes += 1;
				return {
					...props,
					...(appearance !== undefined ? { appearance } : {}),
					...(interactions !== undefined ? { interactions } : {}),
					...(bindings !== undefined ? { bindings } : {}),
				};
			},
		]),
	);
	const transformed = transformProps(
		normalized,
		transforms as Parameters<typeof transformProps>[1],
		baseConfig,
	);

	// Steps 7–9 — root props: collections move to designSystem /
	// componentLibrary; the sidecar (and its revision) is removed; the
	// v2 schema version is stamped.
	const defaultTokenMode = options?.defaultTokenMode ?? "default";
	if (
		options?.defaultTokenMode === undefined &&
		Object.keys(state.tokenModes).length > 0 &&
		state.tokenModes.default === undefined
	) {
		diagnostics.push({
			code: "MIGRATION_ASSUMED_TOKEN_MODE",
			severity: "info",
			message:
				'designSystem.defaultTokenMode stamped as "default" (the mode the legacy export pipeline baked); the document declares modes but none named "default". Pass options.defaultTokenMode to choose explicitly.',
		});
	}
	const hasDesignSystem =
		state.breakpoints.length > 0 ||
		Object.keys(state.tokens).length > 0 ||
		Object.keys(state.tokenModes).length > 0 ||
		Object.keys(state.styleDefinitions).length > 0;
	const designSystem: DesignSystem | undefined = hasDesignSystem
		? {
				breakpoints: state.breakpoints,
				tokens: state.tokens,
				tokenModes: state.tokenModes,
				defaultTokenMode,
				styleDefinitions: state.styleDefinitions,
			}
		: undefined;
	const componentLibrary: DocumentComponentLibrary | undefined =
		Object.keys(state.componentDefinitions).length > 0
			? { definitions: state.componentDefinitions }
			: undefined;

	const { [ANVILKIT_AUTHORING_KEY]: _removedSidecar, ...remainingRootProps } =
		(transformed.root?.props ?? {}) as Record<string, unknown>;
	const migratedData: Data = {
		...transformed,
		root: {
			...transformed.root,
			props: {
				...remainingRootProps,
				...(designSystem !== undefined ? { designSystem } : {}),
				...(componentLibrary !== undefined ? { componentLibrary } : {}),
				authoringSchemaVersion: 2,
			},
		},
	} as Data;

	// Step 11 — CSS parity: REMOVED by `p3-009`.
	//
	// The check compared `buildExportStylesheet` (the legacy sidecar CSS
	// emitter) against `compileDocumentAppearance` and refused the
	// migration on disagreement. `buildExportStylesheet` was the second
	// CSS emitter, and PLAN-0026 contract rule 3 requires exactly one —
	// so the comparison has no second side left to compare against. The
	// legacy emitter is gone; `style-compiler/compile.ts` is what the
	// editor, the preview, production rendering and export all consume,
	// which is the property the parity check existed to approximate.
	//
	// What is genuinely lost is the per-document, per-(node, layer)
	// PROOF that a specific migrated document renders identically to its
	// legacy self. That is a verification obligation, filed on the
	// deferred-verification ledger against `p8-006`, not a behaviour the
	// product still has.

	// Step 12 — all clear: commit the pure result.
	return {
		status: "migrated",
		data: migratedData,
		diagnostics,
		report: {
			visitedNodes,
			migratedNodes,
			orphanNodeStates,
			unknownComponentTypes,
			unknownTargets,
		},
	};
}

function blocked(
	diagnostics: MigrationDiagnostic[],
	report: MigrationResult["report"],
	extra?: MigrationDiagnostic,
): MigrationResult {
	if (extra !== undefined) diagnostics.push(extra);
	return { status: "blocked", diagnostics, report };
}

/** Structured clone that tolerates plain-JSON Puck documents. */
function structuredCloneData(data: Data): Data {
	return structuredClone(data);
}

