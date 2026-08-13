/**
 * @file PLAN-0025 §7 — `compileDocumentAppearance`, the single pure
 * appearance compiler.
 *
 * One pipeline for editor, preview, production, and export: v2 Data
 * (per-node `props.appearance`, root `props.designSystem`) + Config
 * (metadata v2 allowlists) → deterministic CSS + diagnostics +
 * fingerprint. Pure and total: no DOM, no context, no globals; bad
 * input degrades to diagnostics, never a throw.
 *
 * Deliberate reuse (P1-04): token resolution, style-definition
 * merging, responsive layering, and the allowlisted CSS serializer
 * are the EXISTING React-free engine modules
 * (`editor/resolve/node.js`, `editor/style/resolve-authoring-style.js`)
 * consumed in place — the same primitives both legacy pipelines use,
 * which is what makes P1-06 golden parity byte-honest. The emission
 * loop mirrors `editor/style/export-stylesheet.ts` (desktop-first
 * max-width layers, retraction via `display: revert`, dedupe of
 * unchanged layers) with one difference: selectors target the §6.2
 * pair `[data-ak-style-node="<id>"][data-ak-style-target="<t>"]`.
 *
 * Known deviations from the plan text, both recorded in the phase
 * report: media queries are DESKTOP-FIRST (descending max-width) to
 * match the existing `BreakpointDefinition.maxWidth` model — the
 * plan's "ascending" phrasing assumes a min-width model this repo
 * does not use; and hidden→visible restoration keeps the legacy
 * `display: revert` until components declare base display (§7.4
 * follow-up, Phase 2).
 */

import type {
	AnvilAppearance,
	DesignSystem,
	EditorError,
} from "@anvilkit/contracts/editor";
import { safeParseDesignSystem } from "@anvilkit/schema/editor";
import type { Config, Data } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { resolveTargetAppearance } from "../editor/resolve/node.js";
import { resolveAuthoringStyle } from "../editor/style/resolve-authoring-style.js";
import {
	type AuthorablePropertyLocation,
	authorablePropertyForSpecKey,
	readEditorMetadataFor,
	resolveStyleTargets,
} from "../puck/component-metadata.js";
import type { AppearanceCompilerCache } from "./cache.js";
import { createDiagnosticSink, fingerprintOf } from "./diagnostics.js";

/** Input to {@link compileDocumentAppearance}. */
export interface CompileAppearanceInput {
	readonly data: Data;
	readonly config: Config;
	/** Active token mode; defaults to the design system's default. */
	readonly tokenMode?: string;
	/** Escalate authorization diagnostics from warning to error. */
	readonly strict?: boolean;
	/** Optional fragment cache (P1-07); output-identical when present. */
	readonly cache?: AppearanceCompilerCache;
}

/** The compiled document appearance. */
export interface CompiledAppearance {
	readonly css: string;
	readonly diagnostics: readonly EditorError[];
	/** Node ids that emitted at least one rule, sorted. */
	readonly styledNodeIds: readonly string[];
	/** Sorted target ids per styled node id. */
	readonly targetManifest: Readonly<Record<string, readonly string[]>>;
	/** Cross-surface content fingerprint (css + diagnostic codes). */
	readonly fingerprint: string;
	/**
	 * The token mode this compilation actually used — `input.tokenMode`
	 * when given, otherwise the design system's `defaultTokenMode`.
	 *
	 * Reported because the caller cannot re-derive it: resolving the
	 * default requires the parsed design system. `AnvilKitRender` used to
	 * guess `tokenMode ?? "default"` for its page-root attribute, which
	 * misreported the mode whenever a design system declared a different
	 * default (review 0036 L-5).
	 */
	readonly tokenMode: string;
}

const EMPTY_DESIGN_SYSTEM: DesignSystem = {
	breakpoints: [],
	tokens: {},
	tokenModes: {},
	defaultTokenMode: "default",
	styleDefinitions: {},
};

interface CollectedNode {
	readonly nodeId: string;
	readonly type: string;
	readonly appearance: AnvilAppearance;
}

interface TargetCapability {
	readonly properties: ReadonlySet<string>;
}

type MetadataByType = ReadonlyMap<
	string,
	ReadonlyMap<string, TargetCapability>
>;

/**
 * Read `metadata.anvilkit.editor` v2 declarations from a Config.
 * Interpretation lives in `puck/component-metadata.ts` — the SAME
 * module the Inspector reads (§6.1: one allowlist, two consumers);
 * this only projects it into per-type capability sets. A v2 component
 * with zero valid targets keeps its (empty) entry, distinct from a
 * component with no v2 declaration at all.
 */
function readMetadataV2(config: Config): MetadataByType {
	const byType = new Map<string, ReadonlyMap<string, TargetCapability>>();
	for (const type of Object.keys(config.components ?? {})) {
		if (readEditorMetadataFor(config, type) === undefined) continue;
		const targets = new Map<string, TargetCapability>();
		for (const target of resolveStyleTargets(config, type)) {
			targets.set(target.id, { properties: new Set(target.properties) });
		}
		byType.set(type, targets);
	}
	return byType;
}

/**
 * Drop resolved spec keys whose §6.1 property the target's allowlist
 * does not grant. Spec keys are translated through the shared
 * vocabulary (`borderRadius` grants the `radius` spec key, `boxShadow`
 * grants `shadows`); keys outside the vocabulary are never grantable.
 */
function filterByAllowlist<T extends object>(
	family: Partial<T>,
	familyName: AuthorablePropertyLocation["family"],
	allowed: ReadonlySet<string>,
	dropped: Set<string>,
): Partial<T> {
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(family)) {
		const property = authorablePropertyForSpecKey(familyName, key);
		if (property !== undefined && allowed.has(property)) {
			kept[key] = value;
		} else {
			dropped.add(property ?? key);
		}
	}
	return kept as Partial<T>;
}

const BASE_LAYER_WIDTH = Number.MAX_SAFE_INTEGER;

function cssEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Compile a v2 document's authored appearance to deterministic CSS.
 * See the file header for contract, reuse, and deviation notes.
 */
export function compileDocumentAppearance(
	input: CompileAppearanceInput,
): CompiledAppearance {
	const sink = createDiagnosticSink();
	const severity =
		input.strict === true ? ("error" as const) : ("warning" as const);

	// 1. Design system: validated root props, or the empty default.
	const rawDesignSystem = (
		input.data.root?.props as { designSystem?: unknown } | undefined
	)?.designSystem;
	let designSystem = EMPTY_DESIGN_SYSTEM;
	if (rawDesignSystem !== undefined) {
		const parsed = safeParseDesignSystem(rawDesignSystem);
		if (parsed.success) {
			designSystem = parsed.data;
		} else {
			sink.add([
				makeEditorError(
					"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
					"root.props.designSystem failed schema validation; compiling without it",
					{
						severity,
						recoverable: true,
						details: { issueCount: parsed.error.issues.length },
					},
				),
			]);
		}
	}

	// 2. Collect appearance-bearing nodes via the official traversal —
	// covers content and slots; raw legacy zones are invisible until
	// migrate() (locked by the P0-04 fixture pack).
	const collected: CollectedNode[] = [];
	const seenIds = new Set<string>();
	walkTree(input.data, input.config, (content) => {
		for (const item of content) {
			const nodeId = String(item.props.id ?? "");
			if (nodeId === "") continue;
			if (seenIds.has(nodeId)) {
				sink.add([
					makeEditorError(
						"EDITOR_INVALID_CSS_VALUE",
						`duplicate node id "${nodeId}" — appearance for it is ambiguous`,
						{ severity: "error", nodeIds: [nodeId] },
					),
				]);
				continue;
			}
			seenIds.add(nodeId);
			const appearance = (item.props as { appearance?: AnvilAppearance })
				.appearance;
			// No version gate: there is one document form, and since
			// `p7-002` stripped the markers from the store it carries no
			// version key at all (PLAN-0026 §5). An out-of-contract
			// artifact that still has one is preserved as an unknown key
			// and read by nothing here.
			if (appearance === undefined || appearance.targets === undefined) {
				continue;
			}
			collected.push({ nodeId, type: String(item.type), appearance });
		}
	});
	collected.sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));

	const metadata = readMetadataV2(input.config);
	const tokenMode = input.tokenMode ?? designSystem.defaultTokenMode;

	// 3. Synthetic v1 state per (node, target): the shared resolvers
	// NUL is schema-invalid in every id, so the composite key can never
	// collide with a real id (repo \u0000 convention).
	const NODE_TARGET_SEP = "\u0000";
	const compositeIds: string[] = [];
	const targetsByNode = new Map<string, string[]>();
	for (const node of collected) {
		const declared = metadata.get(node.type);
		for (const [targetId] of Object.entries(node.appearance.targets ?? {}).sort(
			([a], [b]) => (a < b ? -1 : 1),
		)) {
			if (declared === undefined || !declared.has(targetId)) {
				sink.add([
					makeEditorError(
						"EDITOR_INVALID_CSS_VALUE",
						declared === undefined
							? `component "${node.type}" declares no metadata v2 style targets; appearance ignored`
							: `target "${targetId}" is not declared by component "${node.type}"; appearance ignored`,
						{
							severity,
							nodeIds: [node.nodeId],
							details: { reason: "unknown-target", target: targetId },
						},
					),
				]);
				continue;
			}
			compositeIds.push(`${node.nodeId}${NODE_TARGET_SEP}${targetId}`);
			const list = targetsByNode.get(node.nodeId) ?? [];
			list.push(targetId);
			targetsByNode.set(node.nodeId, list);
		}
	}

	// 4. Desktop-first layered emission — mirrors the export pipeline.
	const enabled = [...designSystem.breakpoints]
		.filter((breakpoint) => breakpoint.enabled)
		.sort((a, b) => b.maxWidth - a.maxWidth);
	const layers = [
		{ key: "base", width: BASE_LAYER_WIDTH },
		...enabled.map((breakpoint) => ({
			key: breakpoint.id,
			width: breakpoint.maxWidth,
		})),
	];
	const rulesByLayer = new Map<string, string[]>(
		layers.map((layer) => [layer.key, []]),
	);
	const styledNodeIds = new Set<string>();
	const targetManifest: Record<string, string[]> = {};

	const syntheticIds = [...compositeIds].sort();
	for (const syntheticId of syntheticIds) {
		const [nodeId, targetId] = syntheticId.split(NODE_TARGET_SEP) as [
			string,
			string,
		];
		const node = collected.find((entry) => entry.nodeId === nodeId);
		const allowed =
			node === undefined
				? undefined
				: metadata.get(node.type)?.get(targetId)?.properties;
		const cacheKey = `${node?.type ?? ""}|${syntheticId}`;
		const cached = input.cache?.get(cacheKey);
		const targetValue = node?.appearance.targets?.[targetId];
		if (
			cached !== undefined &&
			cached.appearance === targetValue &&
			cached.designSystem === designSystem &&
			cached.tokenMode === tokenMode
		) {
			for (const [layerKey, rule] of cached.rulesByLayer) {
				rulesByLayer.get(layerKey)?.push(rule);
			}
			sink.add(cached.diagnostics);
			if (cached.rulesByLayer.length > 0) {
				styledNodeIds.add(nodeId);
				(targetManifest[nodeId] ??= []).push(targetId);
			}
			continue;
		}

		const droppedProperties = new Set<string>();
		const emitted: [string, string][] = [];
		const localDiagnostics: EditorError[] = [];
		let lastEmittedBody: string | undefined;
		let lastEmittedHidden = false;
		for (const layer of layers) {
			const resolved = resolveTargetAppearance(targetValue, {
				designSystem,
				breakpoints: designSystem.breakpoints,
				viewportWidth: layer.width,
				tokenMode,
				defaultTokenMode: designSystem.defaultTokenMode,
			});
			localDiagnostics.push(...resolved.diagnostics);
			const materialized = resolveAuthoringStyle({
				nodeId: syntheticId,
				layout:
					allowed === undefined
						? resolved.layout
						: filterByAllowlist(
								resolved.layout,
								"layout",
								allowed,
								droppedProperties,
							),
				style:
					allowed === undefined
						? resolved.style
						: filterByAllowlist(
								resolved.style,
								"visual",
								allowed,
								droppedProperties,
							),
				typography:
					allowed === undefined
						? resolved.typography
						: filterByAllowlist(
								resolved.typography,
								"typography",
								allowed,
								droppedProperties,
							),
				hidden: resolved.hidden,
			});
			localDiagnostics.push(...materialized.diagnostics);

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
			if (body === "" && lastEmittedBody === undefined) continue;
			if (body === lastEmittedBody) continue;
			if (body === "") continue;
			const selector = `[data-ak-style-node="${cssEscape(nodeId)}"][data-ak-style-target="${cssEscape(targetId)}"]`;
			emitted.push([layer.key, `${selector} { ${body} }`]);
			lastEmittedBody = body;
			lastEmittedHidden = resolved.hidden;
		}
		for (const dropped of [...droppedProperties].sort()) {
			localDiagnostics.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`property "${dropped}" is not in the allowlist of target "${targetId}" on "${node?.type ?? "?"}"`,
					{
						severity,
						nodeIds: [nodeId],
						details: { reason: "unauthorized-property", property: dropped },
					},
				),
			);
		}
		// Diagnostics carry the synthetic id internally; rewrite to the
		// real node id before they become part of the public result.
		const publicDiagnostics = localDiagnostics.map((entry) =>
			entry.nodeIds === undefined
				? entry
				: {
						...entry,
						nodeIds: entry.nodeIds.map((id) =>
							id.split(NODE_TARGET_SEP)[0] === nodeId ? nodeId : id,
						),
					},
		);
		for (const [layerKey, rule] of emitted) {
			rulesByLayer.get(layerKey)?.push(rule);
		}
		sink.add(publicDiagnostics);
		if (emitted.length > 0) {
			styledNodeIds.add(nodeId);
			(targetManifest[nodeId] ??= []).push(targetId);
		}
		input.cache?.set(cacheKey, {
			appearance: targetValue,
			designSystem,
			tokenMode,
			rulesByLayer: emitted,
			diagnostics: publicDiagnostics,
		});
	}

	// 5. Assemble: base rules, then media blocks widest-first, skipping
	// empty layers — byte-deterministic given identical input.
	const parts: string[] = [...(rulesByLayer.get("base") ?? [])];
	for (const breakpoint of enabled) {
		const rules = rulesByLayer.get(breakpoint.id) ?? [];
		if (rules.length === 0) continue;
		parts.push(
			`@media (max-width: ${breakpoint.maxWidth}px) { ${rules.join(" ")} }`,
		);
	}
	const css = parts.join("\n");
	const diagnostics = sink.all;
	const manifest: Record<string, readonly string[]> = {};
	for (const key of Object.keys(targetManifest).sort()) {
		manifest[key] = [...(targetManifest[key] ?? [])].sort();
	}
	return {
		css,
		diagnostics,
		styledNodeIds: [...styledNodeIds].sort(),
		targetManifest: manifest,
		fingerprint: fingerprintOf(
			`${css}\u0000${diagnostics.map((entry) => entry.code).join(",")}`,
		),
		tokenMode,
	};
}
