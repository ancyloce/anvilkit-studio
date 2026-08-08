/**
 * @file `readDesignSystem` — the Design System panel's read projection
 * (PLAN-0028 `p4-003`, PLAN-0026 §3.5/§3.8.3). Pure and React-free.
 *
 * `designSystem` is a **declared root prop** (contract rule 2), so the
 * panel's list of tokens, modes and style definitions is a projection
 * of `root.props.designSystem` — reached through `DocumentModel`, never
 * through a sidecar. The only other input is the node set, and only
 * because "which elements use this style definition" is a fact about
 * `props.appearance.targets[*].styleRefs`, which lives on the nodes.
 *
 * ### Nothing here resolves a token for rendering
 *
 * Contract rule 3: token resolution happens inside the one compiler, so
 * the panel changes a value and all four consumers see it. The
 * `resolveToken` call below exists so the *panel* can display what a
 * token currently means (and flag one that resolves nowhere) — it is
 * the same engine function `style-compiler/compile.ts` resolves with,
 * consumed here rather than re-derived, and its output never reaches
 * the document or the canvas.
 *
 * ### A reference is not a literal, and the projection says which
 *
 * Every mode row carries `tokenDerived` — `true` when the stored value
 * is `{kind:"alias"}` — plus the alias target's path. That is the
 * read-side half of the provenance display `p4-001` renders in the
 * Style panel: the same distinction, made at the same place the value
 * is read.
 */

import type {
	AnvilAppearance,
	DesignSystem,
	DesignToken,
	StyleDefinition,
	TokenMode,
	TokenModeId,
	TokenType,
	TokenValue,
} from "@anvilkit/contracts/editor";
import {
	resolveToken,
	type TokenResolution,
} from "../../../../editor/resolve/token.js";
import { isTokenRef } from "../../../../editor/tokens/walk.js";
import { FALLBACK_TOKEN_MODE } from "../../tokens/token-mode.js";

/**
 * Depth cap for the reference walk. Matches the bound the sidecar-era
 * counter used, so the two surfaces report the same number while both
 * exist.
 */
const MAX_WALK_DEPTH = 64;

/** Reference counts and reverse alias edges, from one traversal. */
export interface TokenReferenceIndex {
	/** Token id → how many places reference it (values plus alias edges). */
	readonly counts: ReadonlyMap<string, number>;
	/** Token id → ids of the tokens whose value aliases it. */
	readonly aliasDependents: ReadonlyMap<string, readonly string[]>;
}

/**
 * Count every `{kind:"token"}` reference reachable from `roots`, plus
 * the alias edges declared between tokens.
 *
 * Generic over the roots rather than tied to one document shape: the
 * canonical caller passes node appearances, style definitions and
 * component definitions; the retained sidecar hook passes its own three
 * records. One implementation, so the two cannot disagree about a
 * count while both surfaces exist.
 *
 * `isTokenRef` is the engine's own predicate (`editor/tokens/walk.ts`),
 * consumed rather than re-spelled — a second definition of "what a
 * token reference looks like" is exactly the drift this program exists
 * to remove.
 */
export function countTokenReferences(
	roots: readonly unknown[],
	tokens: Readonly<Record<string, DesignToken>>,
): TokenReferenceIndex {
	const counts = new Map<string, number>();
	const aliasDependents = new Map<string, string[]>();

	const bump = (tokenId: string): void => {
		counts.set(tokenId, (counts.get(tokenId) ?? 0) + 1);
	};
	const walk = (value: unknown, depth: number): void => {
		if (depth > MAX_WALK_DEPTH) return;
		if (Array.isArray(value)) {
			for (const entry of value) walk(entry, depth + 1);
			return;
		}
		if (typeof value !== "object" || value === null) return;
		if (isTokenRef(value)) {
			bump(value.tokenId);
			return;
		}
		for (const entry of Object.values(value as Record<string, unknown>)) {
			walk(entry, depth + 1);
		}
	};

	for (const root of roots) walk(root, 0);

	for (const token of Object.values(tokens)) {
		for (const value of Object.values(token.values)) {
			if (value.kind !== "alias") continue;
			bump(value.tokenId);
			const list = aliasDependents.get(value.tokenId);
			if (list === undefined) aliasDependents.set(value.tokenId, [token.id]);
			else list.push(token.id);
		}
	}
	return { counts, aliasDependents };
}

/** One token's stored value in one mode, with its provenance. */
export interface TokenModeRow {
	readonly modeId: TokenModeId;
	readonly modeName: string;
	/** The stored value; `undefined` means the mode inherits. */
	readonly value: TokenValue<unknown> | undefined;
	/**
	 * `true` when the stored value is an alias — i.e. a token
	 * **reference** rather than a literal. Drives the badge that makes
	 * the two visually distinguishable.
	 */
	readonly tokenDerived: boolean;
	/** The alias target's dotted path, when `tokenDerived`. */
	readonly aliasPath: string | undefined;
	/** What this mode currently means, per the engine's own resolver. */
	readonly resolution: TokenResolution;
}

/** One token row in the panel. */
export interface DesignSystemTokenRow {
	readonly token: DesignToken;
	/** Dotted path label (`color.brand.500`). */
	readonly path: string;
	/** The group heading this token sorts under; `""` when ungrouped. */
	readonly group: string;
	/** How many places reference it (value refs plus alias edges). */
	readonly usageCount: number;
	/** Tokens whose value aliases this one. */
	readonly aliasDependents: readonly string[];
	readonly modes: readonly TokenModeRow[];
	/** `true` when the token resolves in no declared mode. */
	readonly unresolved: boolean;
}

/** Tokens sharing a path prefix, rendered under one heading. */
export interface DesignSystemTokenGroup {
	readonly name: string;
	readonly tokens: readonly DesignSystemTokenRow[];
}

/** One style-definition row. */
export interface DesignSystemStyleRow {
	readonly definition: StyleDefinition;
	/** Node ids referencing it, at any target and any layer. */
	readonly nodeIds: readonly string[];
}

/** What the panel renders. */
export interface DesignSystemProjection {
	/** `false` when the document declares no `designSystem` root prop. */
	readonly present: boolean;
	readonly groups: readonly DesignSystemTokenGroup[];
	readonly tokenCount: number;
	readonly styles: readonly DesignSystemStyleRow[];
	/**
	 * Declared token modes — the choices `p5-007`'s live-preview switch
	 * offers (`ED-FA-006`).
	 *
	 * The set is read-only *here*: this projection lists what the
	 * document declares and the switch selects among them. Nothing in
	 * the switch creates a mode, which is what keeps the `light`/`dark`
	 * ids ADR 0005 Part 2 §5 reserves from being minted or redefined by
	 * the UI. Authoring a mode's *values* is a separate write and
	 * already shipped.
	 */
	readonly modes: readonly TokenMode[];
	readonly defaultMode: TokenModeId;
}

/** One step of an alias chain, for the resolved-value display. */
export interface TokenChainStep {
	readonly tokenId: string;
	readonly name: string;
}

/** One token offered by a picker (ADR 0005 Part 2 §4). */
export interface TokenChoice {
	readonly token: DesignToken;
	/** Dotted path label (`color.brand.500`). */
	readonly path: string;
	/** Provenance badge: imported tokens keep their origin. */
	readonly origin: "document" | "theme" | "brand";
	/** Alias hops from this token to the literal-bearing one. */
	readonly chain: readonly TokenChainStep[];
	/** What it resolves to in the requested mode. */
	readonly resolution: TokenResolution;
}

/**
 * The tokens a picker may offer for a field of `type`.
 *
 * Type-filtered because §15.1 makes compatible type the attach rule as
 * well as the alias rule: a `length` cannot stand in for a `color`, so
 * an incompatible token is never offered rather than offered and
 * rejected.
 */
export function readTokenChoices(
	designSystem: DesignSystem | undefined,
	type: TokenType,
	modeId: TokenModeId,
): readonly TokenChoice[] {
	if (designSystem === undefined) return NO_CHOICES;
	const { tokens, tokenModes, defaultTokenMode } = designSystem;
	return Object.values(tokens)
		.filter((token) => token.type === type)
		.map((token): TokenChoice => {
			const chain: TokenChainStep[] = [];
			const seen = new Set<string>();
			let cursor: DesignToken | undefined = token;
			while (cursor !== undefined && !seen.has(cursor.id)) {
				seen.add(cursor.id);
				chain.push({ tokenId: cursor.id, name: cursor.name });
				// Annotated: `cursor` is reassigned from a value derived from
				// itself, which otherwise trips TS7022 circular inference.
				const value: TokenValue<unknown> | undefined = cursor.values[modeId];
				cursor = value?.kind === "alias" ? tokens[value.tokenId] : undefined;
			}
			return {
				token,
				path: pathOf(token),
				origin: token.source?.system ?? "document",
				chain,
				resolution: resolveToken(token.id, modeId, tokens, tokenModes, {
					defaultModeId: defaultTokenMode,
				}),
			};
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

/** The minimum a node must expose for the style-usage count. */
export interface StyleRefNode {
	readonly appearance: AnvilAppearance | undefined;
}

/** Inputs to {@link readDesignSystem}; all projected from `Data`. */
export interface DesignSystemSource {
	/** `root.props.designSystem`, already validated by the read model. */
	readonly designSystem: DesignSystem | undefined;
	/** The document's nodes — the only source of `styleRefs` usage. */
	readonly nodes: ReadonlyMap<string, StyleRefNode>;
	/** `root.props.componentLibrary.definitions`, for reference counts. */
	readonly componentDefinitions: Readonly<Record<string, unknown>> | undefined;
}

const NO_GROUPS: readonly DesignSystemTokenGroup[] = Object.freeze([]);
const NO_STYLES: readonly DesignSystemStyleRow[] = Object.freeze([]);
const NO_CHOICES: readonly TokenChoice[] = Object.freeze([]);

function pathOf(token: DesignToken): string {
	return token.path.length > 0 ? token.path.join(".") : token.name;
}

/** Every style-definition id referenced by one node, any target/layer. */
function styleRefsOf(node: StyleRefNode): readonly string[] {
	const targets = node.appearance?.targets;
	if (targets === undefined) return [];
	const found: string[] = [];
	for (const target of Object.values(targets)) {
		const refs = target?.styleRefs;
		if (refs === undefined) continue;
		if (refs.base !== undefined) found.push(...refs.base);
		for (const override of Object.values(refs.overrides ?? {})) {
			if (override != null) found.push(...override);
		}
	}
	return found;
}

/**
 * Project the document's design system for the panel.
 *
 * Pure: the same `(designSystem, nodes, componentDefinitions)` always
 * produces the same projection, which is what lets `p4-003`'s hook
 * memoize it on the deferred document without holding any state.
 */
export function readDesignSystem(
	source: DesignSystemSource,
): DesignSystemProjection {
	const { designSystem } = source;
	const defaultMode = designSystem?.defaultTokenMode ?? FALLBACK_TOKEN_MODE;
	if (designSystem === undefined) {
		return {
			present: false,
			groups: NO_GROUPS,
			tokenCount: 0,
			styles: NO_STYLES,
			modes: [{ id: defaultMode, name: defaultMode }],
			defaultMode,
		};
	}

	const declaredModes = Object.values(designSystem.tokenModes);
	const modes: readonly TokenMode[] =
		declaredModes.length > 0
			? [...declaredModes].sort((a, b) => a.id.localeCompare(b.id))
			: [{ id: defaultMode, name: defaultMode }];

	const appearances: unknown[] = [];
	for (const node of source.nodes.values()) {
		if (node.appearance !== undefined) appearances.push(node.appearance);
	}
	const index = countTokenReferences(
		[appearances, designSystem.styleDefinitions, source.componentDefinitions],
		designSystem.tokens,
	);

	const rows = Object.values(designSystem.tokens)
		.map((token): DesignSystemTokenRow => {
			let anyResolved = false;
			const modeRows = modes.map((mode): TokenModeRow => {
				const value = token.values[mode.id];
				const resolution = resolveToken(
					token.id,
					mode.id,
					designSystem.tokens,
					designSystem.tokenModes,
					{ defaultModeId: defaultMode },
				);
				if (resolution.status === "resolved") anyResolved = true;
				const aliasTarget =
					value?.kind === "alias"
						? designSystem.tokens[value.tokenId]
						: undefined;
				return {
					modeId: mode.id,
					modeName: mode.name,
					value,
					tokenDerived: value?.kind === "alias",
					aliasPath:
						aliasTarget === undefined ? undefined : pathOf(aliasTarget),
					resolution,
				};
			});
			return {
				token,
				path: pathOf(token),
				group: token.path.length > 1 ? token.path.slice(0, -1).join(".") : "",
				usageCount: index.counts.get(token.id) ?? 0,
				aliasDependents: index.aliasDependents.get(token.id) ?? [],
				modes: modeRows,
				unresolved: !anyResolved,
			};
		})
		.sort((a, b) => a.path.localeCompare(b.path));

	const byGroup = new Map<string, DesignSystemTokenRow[]>();
	for (const row of rows) {
		const list = byGroup.get(row.group);
		if (list === undefined) byGroup.set(row.group, [row]);
		else list.push(row);
	}
	const groups = [...byGroup.entries()]
		.map(([name, tokens]) => ({ name, tokens }))
		// Ungrouped tokens sort last: a heading-less block between two
		// headed ones reads as belonging to the heading above it.
		.sort((a, b) =>
			a.name === "" ? 1 : b.name === "" ? -1 : a.name.localeCompare(b.name),
		);

	const nodesByDefinition = new Map<string, string[]>();
	for (const [nodeId, node] of source.nodes) {
		for (const id of new Set(styleRefsOf(node))) {
			const list = nodesByDefinition.get(id);
			if (list === undefined) nodesByDefinition.set(id, [nodeId]);
			else list.push(nodeId);
		}
	}
	const styles = Object.values(designSystem.styleDefinitions)
		.map((definition) => ({
			definition,
			nodeIds: nodesByDefinition.get(definition.id) ?? [],
		}))
		.sort((a, b) => a.definition.name.localeCompare(b.definition.name));

	return {
		present: true,
		groups,
		tokenCount: rows.length,
		styles,
		modes,
		defaultMode,
	};
}
