"use client";

/**
 * @file `useDesignSystem` — the document token and reusable-style
 * management model (PLAN-0020 CORE-P2-001/-002/-003;
 * ED-TOKEN-001..003, ED-STYLEDEF-001/002; DD-0019 §9.4, §15.1).
 *
 * The token *picker* answers "which token should this field use". This
 * hook answers the other half §15.1 requires and which had no surface
 * at all: managing the design system itself — update and delete
 * tokens, author aliases, edit per-mode values, inspect usage, preview
 * a deletion's impact and choose how to absorb it, and the same
 * lifecycle for reusable style definitions.
 *
 * ### Nothing here re-implements resolution
 *
 * Alias cycle/depth checking is `checkTokenAliasGraph`; usage is
 * `collectTokenUsage`; the deletion preview is `planTokenDeletion`,
 * which the reducer then applies verbatim — so what the user approves
 * in the impact dialog is byte-for-byte what commits. Style-definition
 * deletion likewise defers to `deleteStyleDefinition`'s diff-based
 * materialization. This module composes them; it owns no second copy
 * of the rules.
 *
 * Entry-chunk safe: the engine loads through dynamic `import()` inside
 * the handlers.
 */

import type {
	DesignToken,
	EditorCommandResult,
	EditorError,
	ResponsiveLayerRef,
	StyleDefinitionDeletionDisposition,
	StyleDefinitionV1,
	TokenDeletionDisposition,
	TokenModeId,
	TokenType,
	TokenValue,
} from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** One token row, with everything the management UI displays. */
export interface DesignSystemToken {
	readonly token: DesignToken;
	/** Dotted path label (`color.brand.500`). */
	readonly path: string;
	/** How many places reference it (value refs plus alias edges). */
	readonly usageCount: number;
	/** Tokens whose value aliases this one. */
	readonly aliasDependents: readonly string[];
	/** Resolved literal per mode; `undefined` where resolution fails. */
	readonly resolvedByMode: Readonly<Record<TokenModeId, unknown>>;
	/** True when the token resolves nowhere (cycle, missing, mismatch). */
	readonly unresolved: boolean;
}

/** One reusable style definition row. */
export interface DesignSystemStyle {
	readonly definition: StyleDefinitionV1;
	/** Node ids referencing it, at any layer. */
	readonly nodeIds: readonly string[];
}

/** The impact preview shown before a token is deleted. */
export interface TokenDeletionPreview {
	readonly tokenId: string;
	readonly siteCount: number;
	readonly aliasDependents: readonly string[];
	readonly errors: readonly EditorError[];
	/** Tokens of the same type that may replace it (ED-TOKEN-003). */
	readonly replacements: readonly DesignToken[];
}

/** Outcome of a design-system mutation. */
export interface DesignSystemOutcome {
	readonly status: "committed" | "rejected";
	readonly errors: readonly EditorError[];
}

/** The document design-system management surface. */
export interface DesignSystemModel {
	readonly tokens: readonly DesignSystemToken[];
	readonly styles: readonly DesignSystemStyle[];
	readonly modes: readonly {
		readonly id: TokenModeId;
		readonly name: string;
	}[];
	readonly defaultMode: TokenModeId;
	readonly canMutate: boolean;
	/** Selected node ids — the attach/detach targets. */
	readonly selectedNodeIds: readonly string[];

	readonly createToken: (input: {
		readonly name: string;
		readonly type: TokenType;
		readonly value: unknown;
		readonly mode?: TokenModeId;
	}) => Promise<DesignSystemOutcome>;
	readonly renameToken: (
		tokenId: string,
		name: string,
	) => Promise<DesignSystemOutcome>;
	/** Write one mode's value — a literal or an alias (ED-TOKEN-001). */
	readonly setTokenValue: (
		tokenId: string,
		mode: TokenModeId,
		value: TokenValue<unknown>,
	) => Promise<DesignSystemOutcome>;
	/** Impact preview; never mutates (ED-TOKEN-003). */
	readonly previewTokenDeletion: (
		tokenId: string,
		disposition: TokenDeletionDisposition,
	) => Promise<TokenDeletionPreview>;
	readonly deleteToken: (
		tokenId: string,
		disposition: TokenDeletionDisposition,
	) => Promise<DesignSystemOutcome>;

	readonly createStyle: (
		name: string,
		appliesTo?: StyleDefinitionV1["appliesTo"],
	) => Promise<DesignSystemOutcome>;
	readonly renameStyle: (
		styleDefinitionId: string,
		name: string,
	) => Promise<DesignSystemOutcome>;
	/** Ordered multi-attach to the current selection (ED-STYLEDEF-001). */
	readonly attachStyle: (
		styleDefinitionId: string,
		options?: {
			readonly position?: number;
			readonly layer?: ResponsiveLayerRef;
		},
	) => Promise<DesignSystemOutcome>;
	readonly detachStyle: (
		styleDefinitionId: string,
		options?: { readonly layer?: ResponsiveLayerRef },
	) => Promise<DesignSystemOutcome>;
	readonly deleteStyle: (
		styleDefinitionId: string,
		disposition: StyleDefinitionDeletionDisposition,
	) => Promise<DesignSystemOutcome>;
}

/**
 * The design-system model, or `null` when the editor runtime is off
 * or still loading.
 */
export function useDesignSystem(): DesignSystemModel | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const port = bridge?.port as InternalEditorCommandPort | null | undefined;
	const defaultMode = bridge?.editorConfig?.defaultTokenMode ?? "light";
	const activeLayer: ResponsiveLayerRef =
		bridge?.responsive?.getActiveLayer() ?? "base";

	const dispatch = useCallback(
		async (command: Record<string, unknown>): Promise<DesignSystemOutcome> => {
			if (port == null) return { status: "rejected", errors: [] };
			const result: EditorCommandResult = await port.execute({
				id: crypto.randomUUID(),
				expectedRevision: port.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				...command,
			} as never);
			return {
				status: result.status === "committed" ? "committed" : "rejected",
				errors: result.errors,
			};
		},
		[port],
	);

	const snapshot = useMemo(() => {
		void version;
		return port?.getSnapshot() ?? null;
	}, [port, version]);

	const tokens = useMemo((): readonly DesignSystemToken[] => {
		if (snapshot === null) return [];
		const authoring = snapshot.authoring;
		const modeIds = Object.keys(authoring.tokenModes);
		const effectiveModes = modeIds.length > 0 ? modeIds : [defaultMode];
		// One usage pass for every token rather than per-token scans.
		const usage = usageCounts(authoring);
		return Object.values(authoring.tokens)
			.map((token) => {
				const resolvedByMode: Record<TokenModeId, unknown> = {};
				let anyResolved = false;
				for (const mode of effectiveModes) {
					const value = resolveTokenSync(
						token.id,
						mode,
						authoring.tokens,
						authoring.tokenModes,
					);
					if (value !== undefined) anyResolved = true;
					resolvedByMode[mode] = value;
				}
				return {
					token,
					path: token.path.length > 0 ? token.path.join(".") : token.name,
					usageCount: usage.counts.get(token.id) ?? 0,
					aliasDependents: usage.aliases.get(token.id) ?? [],
					resolvedByMode,
					unresolved: !anyResolved,
				};
			})
			.sort((a, b) => a.path.localeCompare(b.path));
	}, [snapshot, defaultMode]);

	const styles = useMemo((): readonly DesignSystemStyle[] => {
		if (snapshot === null) return [];
		const authoring = snapshot.authoring;
		const byDefinition = new Map<string, string[]>();
		for (const [nodeId, record] of Object.entries(authoring.nodes)) {
			const refs = record.styleRefs;
			if (refs === undefined) continue;
			const all = [
				...(refs.base ?? []),
				...Object.values(refs.overrides ?? {}).flatMap((entry) => entry ?? []),
			];
			for (const id of new Set(all)) {
				const list = byDefinition.get(id);
				if (list === undefined) byDefinition.set(id, [nodeId]);
				else list.push(nodeId);
			}
		}
		return Object.values(authoring.styleDefinitions)
			.map((definition) => ({
				definition,
				nodeIds: byDefinition.get(definition.id) ?? [],
			}))
			.sort((a, b) => a.definition.name.localeCompare(b.definition.name));
	}, [snapshot]);

	const createToken = useCallback(
		async (input: {
			readonly name: string;
			readonly type: TokenType;
			readonly value: unknown;
			readonly mode?: TokenModeId;
		}): Promise<DesignSystemOutcome> => {
			const name = input.name.trim();
			if (name.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("a token needs a name", {
							kind: "token",
							reason: "empty-name",
						}),
					],
				};
			}
			const mode = input.mode ?? defaultMode;
			const token: DesignToken = {
				id: crypto.randomUUID(),
				// Dotted names become the path, so `color.brand` groups in
				// the list exactly the way the author typed it.
				path: name.split("."),
				name,
				type: input.type,
				values: { [mode]: { kind: "literal", value: input.value } } as never,
			};
			return dispatch({ type: "token.create", token });
		},
		[dispatch, defaultMode],
	);

	const renameToken = useCallback(
		async (tokenId: string, name: string): Promise<DesignSystemOutcome> => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("a token needs a name", {
							kind: "token",
							tokenId,
							reason: "empty-name",
						}),
					],
				};
			}
			return dispatch({
				type: "token.update",
				tokenId,
				patch: { name: trimmed, path: trimmed.split(".") },
			});
		},
		[dispatch],
	);

	const setTokenValue = useCallback(
		async (
			tokenId: string,
			mode: TokenModeId,
			value: TokenValue<unknown>,
		): Promise<DesignSystemOutcome> => {
			// Alias cycles and over-deep chains are rejected by the
			// reducer's own `checkTokenAliasGraph`; checking here too would
			// be a second implementation of the same rule. What this does
			// catch first is the trivially self-referential case, because
			// the error message is far clearer at this level.
			if (value.kind === "alias" && value.tokenId === tokenId) {
				return {
					status: "rejected",
					errors: [
						{
							code: "EDITOR_TOKEN_CYCLE",
							severity: "error",
							message: "a token cannot alias itself",
							recoverable: true,
							details: { kind: "token", tokenId },
						},
					],
				};
			}
			return dispatch({
				type: "token.update",
				tokenId,
				patch: { values: { [mode]: value } },
			});
		},
		[dispatch],
	);

	const previewTokenDeletion = useCallback(
		async (
			tokenId: string,
			disposition: TokenDeletionDisposition,
		): Promise<TokenDeletionPreview> => {
			if (port == null) {
				return {
					tokenId,
					siteCount: 0,
					aliasDependents: [],
					errors: [],
					replacements: [],
				};
			}
			const { planTokenDeletion } = await import("../../../editor/index.js");
			const authoring = port.getSnapshot().authoring;
			const plan = planTokenDeletion(authoring, tokenId, disposition, {
				tokenMode: defaultMode,
				defaultTokenMode: defaultMode,
			});
			const type = authoring.tokens[tokenId]?.type;
			return {
				tokenId,
				siteCount: plan.sites.length,
				aliasDependents: plan.aliasDependents,
				errors: plan.errors,
				// Only same-type tokens may replace: a length cannot stand
				// in for a color (§15.1 type compatibility).
				replacements: Object.values(authoring.tokens).filter(
					(candidate) => candidate.id !== tokenId && candidate.type === type,
				),
			};
		},
		[port, defaultMode],
	);

	const deleteToken = useCallback(
		async (
			tokenId: string,
			disposition: TokenDeletionDisposition,
		): Promise<DesignSystemOutcome> =>
			dispatch({
				type: "token.delete",
				tokenId,
				disposition,
				tokenMode: defaultMode,
			}),
		[dispatch, defaultMode],
	);

	const createStyle = useCallback(
		async (
			name: string,
			appliesTo: StyleDefinitionV1["appliesTo"] = "any",
		): Promise<DesignSystemOutcome> => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("a style needs a name", {
							kind: "styleDefinition",
							reason: "empty-name",
						}),
					],
				};
			}
			const timestamp = new Date().toISOString();
			const definition: StyleDefinitionV1 = {
				version: "1",
				id: crypto.randomUUID(),
				name: trimmed,
				appliesTo,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			return dispatch({ type: "styleDefinition.create", definition });
		},
		[dispatch],
	);

	const renameStyle = useCallback(
		async (
			styleDefinitionId: string,
			name: string,
		): Promise<DesignSystemOutcome> => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("a style needs a name", {
							kind: "styleDefinition",
							styleDefinitionId,
							reason: "empty-name",
						}),
					],
				};
			}
			return dispatch({
				type: "styleDefinition.update",
				styleDefinitionId,
				patch: { name: trimmed, updatedAt: new Date().toISOString() },
			});
		},
		[dispatch],
	);

	const selectedNodeIds = snapshot?.selection.selectedIds ?? [];

	const attachStyle = useCallback(
		async (
			styleDefinitionId: string,
			options?: {
				readonly position?: number;
				readonly layer?: ResponsiveLayerRef;
			},
		): Promise<DesignSystemOutcome> => {
			const nodeIds = port?.getSnapshot().selection.selectedIds ?? [];
			if (nodeIds.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("select at least one element to attach a style", {
							kind: "styleDefinition",
							styleDefinitionId,
							reason: "empty-selection",
						}),
					],
				};
			}
			return dispatch({
				type: "styleDefinition.attach",
				nodeIds,
				styleDefinitionId,
				layer: options?.layer ?? activeLayer,
				...(options?.position === undefined
					? {}
					: { position: options.position }),
			});
		},
		[dispatch, port, activeLayer],
	);

	const detachStyle = useCallback(
		async (
			styleDefinitionId: string,
			options?: { readonly layer?: ResponsiveLayerRef },
		): Promise<DesignSystemOutcome> => {
			const nodeIds = port?.getSnapshot().selection.selectedIds ?? [];
			if (nodeIds.length === 0) {
				return {
					status: "rejected",
					errors: [
						conflict("select at least one element to detach a style", {
							kind: "styleDefinition",
							styleDefinitionId,
							reason: "empty-selection",
						}),
					],
				};
			}
			return dispatch({
				type: "styleDefinition.detach",
				nodeIds,
				styleDefinitionId,
				layer: options?.layer ?? activeLayer,
			});
		},
		[dispatch, port, activeLayer],
	);

	const deleteStyle = useCallback(
		async (
			styleDefinitionId: string,
			disposition: StyleDefinitionDeletionDisposition,
		): Promise<DesignSystemOutcome> =>
			dispatch({
				type: "styleDefinition.delete",
				styleDefinitionId,
				disposition,
			}),
		[dispatch],
	);

	return useMemo(() => {
		if (bridge == null || port == null || snapshot === null) return null;
		const declaredModes = Object.values(snapshot.authoring.tokenModes);
		return {
			tokens,
			styles,
			modes:
				declaredModes.length > 0
					? declaredModes
					: [{ id: defaultMode, name: defaultMode }],
			defaultMode,
			canMutate: !port.isReadOnly() && !port.writersDisabled(),
			selectedNodeIds,
			createToken,
			renameToken,
			setTokenValue,
			previewTokenDeletion,
			deleteToken,
			createStyle,
			renameStyle,
			attachStyle,
			detachStyle,
			deleteStyle,
		};
	}, [
		bridge,
		port,
		snapshot,
		tokens,
		styles,
		defaultMode,
		selectedNodeIds,
		createToken,
		renameToken,
		setTokenValue,
		previewTokenDeletion,
		deleteToken,
		createStyle,
		renameStyle,
		attachStyle,
		detachStyle,
		deleteStyle,
	]);
}

function conflict(
	message: string,
	details: Readonly<Record<string, unknown>>,
): EditorError {
	return {
		code: "EDITOR_COMMAND_CONFLICT",
		severity: "error",
		message,
		recoverable: true,
		details,
	};
}

/**
 * Reference counts and reverse alias edges in one traversal.
 *
 * Synchronous and dependency-free so the list can render without an
 * async engine import on every keystroke; the traversal itself is the
 * sidecar's own token walk, inlined to the two facts the list needs.
 */
function usageCounts(authoring: {
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly nodes: Readonly<Record<string, unknown>>;
	readonly styleDefinitions: Readonly<Record<string, unknown>>;
	readonly componentDefinitions: Readonly<Record<string, unknown>>;
}): {
	readonly counts: ReadonlyMap<string, number>;
	readonly aliases: ReadonlyMap<string, readonly string[]>;
} {
	const counts = new Map<string, number>();
	const aliases = new Map<string, string[]>();

	const bump = (tokenId: string): void => {
		counts.set(tokenId, (counts.get(tokenId) ?? 0) + 1);
	};
	const walk = (value: unknown, depth: number): void => {
		if (depth > 64) return;
		if (Array.isArray(value)) {
			for (const entry of value) walk(entry, depth + 1);
			return;
		}
		if (typeof value !== "object" || value === null) return;
		const candidate = value as { kind?: unknown; tokenId?: unknown };
		if (candidate.kind === "token" && typeof candidate.tokenId === "string") {
			bump(candidate.tokenId);
			return;
		}
		for (const entry of Object.values(value as Record<string, unknown>)) {
			walk(entry, depth + 1);
		}
	};

	walk(authoring.nodes, 0);
	walk(authoring.styleDefinitions, 0);
	walk(authoring.componentDefinitions, 0);

	for (const token of Object.values(authoring.tokens)) {
		for (const value of Object.values(token.values)) {
			if (value.kind !== "alias") continue;
			bump(value.tokenId);
			const list = aliases.get(value.tokenId);
			if (list === undefined) aliases.set(value.tokenId, [token.id]);
			else list.push(token.id);
		}
	}
	return { counts, aliases };
}

/**
 * Resolve a token to its literal in `mode`, following aliases.
 *
 * A bounded local walk rather than an async import of the engine's
 * `resolveToken`: the list resolves every token in every mode on each
 * render, and the alias chain is capped at the same depth the engine
 * enforces, so a cycle terminates instead of hanging.
 */
function resolveTokenSync(
	tokenId: string,
	mode: TokenModeId,
	tokens: Readonly<Record<string, DesignToken>>,
	modes: Readonly<Record<string, unknown>>,
): unknown {
	void modes;
	const seen = new Set<string>();
	let currentId = tokenId;
	for (let depth = 0; depth < 8; depth += 1) {
		if (seen.has(currentId)) return undefined;
		seen.add(currentId);
		const token = tokens[currentId];
		if (token === undefined) return undefined;
		const value = token.values[mode] ?? Object.values(token.values)[0];
		if (value === undefined) return undefined;
		if (value.kind === "literal") return value.value;
		currentId = value.tokenId;
	}
	return undefined;
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
