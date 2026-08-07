"use client";

/**
 * @file Token-picker state and actions (PLAN-0020 CORE-P2-002;
 * DD-0019 §15.1; ADR 0005 Part 2 §4).
 *
 * The one picker contract for the page editor: filter by compatible
 * type, search paths, recents, create-from-literal, import a theme or
 * brand value as a document token recording provenance, and display
 * the resolved value with its alias chain.
 *
 * Every mutation goes through the command port — this hook never
 * writes the sidecar directly (§10.1).
 */

import type {
	DesignToken,
	ImportableTokenValue,
	JsonValue,
	TokenType,
	TokenValue,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandResult,
} from "../../../editor/legacy/index.js";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { resolveToken } from "../../../editor/index.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";
import { activeTokenMode } from "./token-mode.js";

/** How many recently-applied tokens the picker offers. */
const RECENTS_LIMIT = 5;

/**
 * Session-scoped most-recently-applied token ids, newest first.
 *
 * Deliberately module state, not the persisted UI store: recents are
 * a convenience that must not survive a reload as durable document
 * data, and adding a slice to the versioned `editor-ui-store` would
 * force a persist migration for throwaway state.
 *
 * Exposed as a `useSyncExternalStore` source rather than a bare
 * array — a mutated module array is invisible to React, so pickers
 * would keep rendering a stale recents list until some unrelated
 * state change happened to re-run their memo.
 */
let recentTokenIds: readonly string[] = [];
const recentListeners = new Set<() => void>();

function subscribeRecents(listener: () => void): () => void {
	recentListeners.add(listener);
	return () => {
		recentListeners.delete(listener);
	};
}

function getRecents(): readonly string[] {
	return recentTokenIds;
}

function setRecents(next: readonly string[]): void {
	recentTokenIds = next;
	for (const listener of recentListeners) {
		listener();
	}
}

function rememberToken(tokenId: string): void {
	setRecents(
		[tokenId, ...recentTokenIds.filter((id) => id !== tokenId)].slice(
			0,
			RECENTS_LIMIT,
		),
	);
}

/** Test seam: clear the session recents. */
export function clearTokenRecents(): void {
	setRecents([]);
}

/**
 * The literal a referenced token resolves to in the active mode —
 * what "detach by writing the resolved literal" (§15.1) writes back.
 * `undefined` when the token is missing, cyclic, or type-mismatched,
 * in which case the caller must not offer detach.
 */
export function resolveTokenLiteral(
	context: EditorInspectorContext,
	tokenId: string,
): unknown {
	const resolution = resolveToken(
		tokenId,
		activeTokenMode(context.bridge.editorConfig),
		context.authoring.tokens,
		context.authoring.tokenModes,
	);
	return resolution.status === "resolved" ? resolution.value : undefined;
}

/** One step of an alias chain, for the resolved-value display. */
export interface TokenChainStep {
	readonly tokenId: string;
	readonly name: string;
}

/** What the picker shows for one document token. */
export interface TokenPickerEntry {
	readonly token: DesignToken;
	/** Dotted path label (`color.brand.500`). */
	readonly path: string;
	/** Provenance badge per ADR 0005: imported tokens keep their origin. */
	readonly origin: "document" | "theme" | "brand";
	/** Alias hops from this token to the literal-bearing one. */
	readonly chain: readonly TokenChainStep[];
	/** The literal this token resolves to in the active mode. */
	readonly resolvedValue: unknown;
	/** True when resolution failed (cycle, missing, type mismatch). */
	readonly unresolved: boolean;
}

/** The picker surface a control renders. */
export interface TokenPickerState {
	readonly entries: readonly TokenPickerEntry[];
	readonly recents: readonly TokenPickerEntry[];
	readonly importable: readonly ImportableTokenValue[];
	readonly search: string;
	readonly setSearch: (next: string) => void;
	/** Attach an existing document token to the field. */
	readonly attach: (tokenId: string) => void;
	/** Create a token from the field's current literal, then attach it. */
	readonly createFromLiteral: (
		name: string,
		value: JsonValue,
	) => Promise<EditorCommandResult>;
	/** Import a theme/brand value as a document token, then attach it. */
	readonly importValue: (
		value: ImportableTokenValue,
	) => Promise<EditorCommandResult>;
}

function pathOf(token: DesignToken): string {
	return token.path.length > 0 ? token.path.join(".") : token.name;
}

function originOf(token: DesignToken): TokenPickerEntry["origin"] {
	return token.source?.system ?? "document";
}

/**
 * Build the picker model for one field.
 *
 * @param context live inspector context (authoring + command port)
 * @param type the field's token type — only compatible tokens are
 *   offered, matching the alias compatibility rule (§15.1)
 * @param onAttach applies the chosen token to the field; the caller
 *   owns the write because only it knows the field's value shape
 *   (`{kind:"token"}` in a `CssLength` slot vs a `TokenOrLiteral` one)
 */
export function useTokenPicker(
	context: EditorInspectorContext,
	type: TokenType,
	onAttach: (tokenId: string) => void,
): TokenPickerState {
	const { authoring, commands, bridge } = context;
	const [search, setSearch] = useState("");
	const tokenMode = activeTokenMode(bridge.editorConfig);

	const allEntries = useMemo((): readonly TokenPickerEntry[] => {
		return Object.values(authoring.tokens)
			.filter((token) => token.type === type)
			.map((token): TokenPickerEntry => {
				const chain: TokenChainStep[] = [];
				let cursor: DesignToken | undefined = token;
				const seen = new Set<string>();
				while (cursor !== undefined && !seen.has(cursor.id)) {
					seen.add(cursor.id);
					chain.push({ tokenId: cursor.id, name: cursor.name });
					// Annotated: `cursor` is reassigned from a value derived
					// from itself, which otherwise trips TS7022 circular
					// inference.
					const value: TokenValue<unknown> | undefined =
						cursor.values[tokenMode];
					cursor =
						value?.kind === "alias"
							? authoring.tokens[value.tokenId]
							: undefined;
				}
				const resolution = resolveToken(
					token.id,
					tokenMode,
					authoring.tokens,
					authoring.tokenModes,
				);
				return {
					token,
					path: pathOf(token),
					origin: originOf(token),
					chain,
					resolvedValue:
						resolution.status === "resolved" ? resolution.value : undefined,
					unresolved: resolution.status !== "resolved",
				};
			})
			.sort((a, b) => a.path.localeCompare(b.path));
	}, [authoring.tokens, authoring.tokenModes, type, tokenMode]);

	const entries = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (needle === "") {
			return allEntries;
		}
		return allEntries.filter(
			(entry) =>
				entry.path.toLowerCase().includes(needle) ||
				entry.token.name.toLowerCase().includes(needle),
		);
	}, [allEntries, search]);

	const recentIds = useSyncExternalStore(
		subscribeRecents,
		getRecents,
		getRecents,
	);
	const recents = useMemo(
		() =>
			recentIds
				.map((id) => allEntries.find((entry) => entry.token.id === id))
				.filter((entry): entry is TokenPickerEntry => entry !== undefined),
		[allEntries, recentIds],
	);

	const importable = useMemo(
		() =>
			(bridge.editorConfig?.importableTokens ?? []).filter(
				(value) => value.type === type,
			),
		[bridge.editorConfig, type],
	);

	const attach = useCallback(
		(tokenId: string): void => {
			rememberToken(tokenId);
			onAttach(tokenId);
		},
		[onAttach],
	);

	const createToken = useCallback(
		async (token: DesignToken): Promise<EditorCommandResult> => {
			// Live revision, for the same reason `useInspectorField` reads
			// one: two picker actions inside a single render (create, then
			// create again, or import twice) would otherwise send the
			// second command with the first one's revision.
			const result = await commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: commands.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "token.create",
				token,
			});
			// Attach only on success: a rejected create must not leave the
			// field pointing at a token that does not exist.
			if (result.status !== "rejected") {
				attach(token.id);
			}
			return result;
		},
		[commands, attach],
	);

	const createFromLiteral = useCallback(
		(name: string, value: JsonValue): Promise<EditorCommandResult> => {
			const trimmed = name.trim();
			return createToken({
				id: crypto.randomUUID(),
				path: trimmed.split(".").filter((segment) => segment !== ""),
				name: trimmed,
				type,
				values: { [tokenMode]: { kind: "literal", value } },
			});
		},
		[createToken, type, tokenMode],
	);

	const importValue = useCallback(
		(value: ImportableTokenValue): Promise<EditorCommandResult> =>
			// Import-as-copy: the literal is copied and `source` records
			// where it came from. No live alias is created, so resolution
			// and generated output never vary on the provenance (ADR 0005).
			createToken({
				id: crypto.randomUUID(),
				path: value.ref.split(".").filter((segment) => segment !== ""),
				name: value.label,
				type: value.type,
				values: { [tokenMode]: { kind: "literal", value: value.value } },
				source: { system: value.system, ref: value.ref },
			}),
		[createToken, tokenMode],
	);

	return {
		entries,
		recents,
		importable,
		search,
		setSearch,
		attach,
		createFromLiteral,
		importValue,
	};
}
