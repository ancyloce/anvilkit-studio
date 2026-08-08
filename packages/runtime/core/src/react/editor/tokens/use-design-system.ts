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
	EditorError,
	ResponsiveLayerRef,
	StyleDefinition,
	StyleDefinitionDeletionDisposition,
	TokenDeletionDisposition,
	TokenModeId,
	TokenType,
	TokenValue,
} from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { EditorCommandResult } from "../../../editor/legacy/index.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { countTokenReferences } from "../composition/design-system/read-design-system.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { activeTokenMode } from "./token-mode.js";

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
	readonly definition: StyleDefinition;
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
		appliesTo?: StyleDefinition["appliesTo"],
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
	const defaultMode = activeTokenMode(bridge?.editorConfig);
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

	/*
	 * The token and style lists are derived from the sidecar alone, so they
	 * key off the authoring state rather than the snapshot. `getVersion`
	 * also fires on selection and diagnostic churn, and `getSnapshot()`
	 * builds a fresh wrapper every time — keying on the snapshot re-walked
	 * every node, style and component definition (plus a resolve per token
	 * per mode) on every canvas click, with this panel mounted permanently
	 * by `ComponentsModule`'s `keepMounted`. `revision` rides along so an
	 * in-place sidecar mutation cannot go unnoticed.
	 */
	const authoring = snapshot?.authoring ?? null;
	const revision = snapshot?.revision ?? -1;

	const tokens = useMemo((): readonly DesignSystemToken[] => {
		void revision;
		if (authoring === null) return [];
		const modeIds = Object.keys(authoring.tokenModes);
		const effectiveModes = modeIds.length > 0 ? modeIds : [defaultMode];
		// One usage pass for every token rather than per-token scans.
		// The counter itself is the canonical
		// `composition/design-system/read-design-system.ts` one, consumed
		// here so this surface and the canonical panel cannot report
		// different reference counts while both exist.
		const usage = countTokenReferences(
			[
				authoring.nodes,
				authoring.styleDefinitions,
				authoring.componentDefinitions,
			],
			authoring.tokens,
		);
		return Object.values(authoring.tokens)
			.map((token) => {
				const resolvedByMode: Record<TokenModeId, unknown> = {};
				let anyResolved = false;
				for (const mode of effectiveModes) {
					const value = resolveTokenSync(
						token.id,
						mode,
						authoring.tokens,
						defaultMode,
					);
					if (value !== undefined) anyResolved = true;
					resolvedByMode[mode] = value;
				}
				return {
					token,
					path: token.path.length > 0 ? token.path.join(".") : token.name,
					usageCount: usage.counts.get(token.id) ?? 0,
					aliasDependents: usage.aliasDependents.get(token.id) ?? [],
					resolvedByMode,
					unresolved: !anyResolved,
				};
			})
			.sort((a, b) => a.path.localeCompare(b.path));
	}, [authoring, revision, defaultMode]);

	const styles = useMemo((): readonly DesignSystemStyle[] => {
		void revision;
		if (authoring === null) return [];
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
	}, [authoring, revision]);

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
			appliesTo: StyleDefinition["appliesTo"] = "any",
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
			const definition: StyleDefinition = {
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
 * Resolve a token to its literal in `mode`, following aliases.
 *
 * A bounded local walk rather than an async import of the engine's
 * `resolveToken`: the list resolves every token in every mode on each
 * render, and the alias chain is capped at the same depth the engine
 * enforces, so a cycle terminates instead of hanging.
 *
 * The fallback rule is the engine's, verbatim (§15.1, `resolve/token.ts`):
 * the requested mode, then the configured default mode, then nothing.
 * It deliberately does NOT fall back to "whatever mode happens to be
 * declared first" — that reported a light-mode literal as the resolved
 * dark-mode value, so a token declared in one mode looked fully specified
 * in every mode, and which mode leaked depended on key insertion order.
 */
function resolveTokenSync(
	tokenId: string,
	mode: TokenModeId,
	tokens: Readonly<Record<string, DesignToken>>,
	defaultModeId: TokenModeId,
): unknown {
	const seen = new Set<string>();
	let currentId = tokenId;
	for (let depth = 0; depth < 8; depth += 1) {
		if (seen.has(currentId)) return undefined;
		seen.add(currentId);
		const token = tokens[currentId];
		if (token === undefined) return undefined;
		const value =
			token.values[mode] ??
			(defaultModeId === mode ? undefined : token.values[defaultModeId]);
		if (value === undefined) return undefined;
		if (value.kind === "literal") return value.value;
		// Aliases resolve only to a compatible type (§15.1) — matching the
		// engine, so the panel cannot show a value the engine calls a
		// type-mismatch.
		const target = tokens[value.tokenId];
		if (target !== undefined && target.type !== token.type) return undefined;
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
