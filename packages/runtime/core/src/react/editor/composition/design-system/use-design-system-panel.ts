"use client";

/**
 * @file `useDesignSystemPanel` — the Design System panel's state, on
 * the canonical read/commit path (PLAN-0028 `p4-003`, PLAN-0026 §3.5,
 * §3.8.3; DD-0019 `ED-FA-003`).
 *
 * The sibling of `data/use-node-bindings.ts` and
 * `interactions/use-node-interactions.ts`, and deliberately shaped the
 * same way: reads are a pure projection of the live document, writes
 * are the shipped commit helper, and the hook itself holds nothing but
 * the last commit's errors.
 *
 * - **Reads** are `useDocumentModel()`. `designSystem` is a declared
 *   root prop (contract rule 2), so `DocumentModel.designSystem` is the
 *   validated `root.props.designSystem` — never a sidecar, never a
 *   second copy.
 * - **Writes** are {@link useDesignSystemCommit}, which already ships
 *   (`puck/update-design-system.ts` + `use-design-system-commit.ts`).
 *   One intent is one functional `setData` with `recordHistory: true`,
 *   so editing a token is exactly one undo, and the canvas repaints
 *   because the compiler recompiles from the same `appState.data`
 *   (contract rule 3 — the panel never resolves a token for rendering).
 * - **Attaching a style definition to a node** is the one write that is
 *   *not* a design-system write: `styleRefs` lives on the node's own
 *   `props.appearance`, so it goes through the equally shipped
 *   {@link useAppearanceCommit}. Still one history entry, still no new
 *   commit path.
 *
 * ### Token deletion is gated on having no references, deliberately
 *
 * §15.1's rule is that deleting a shared value must never silently
 * change how the page looks. Absorbing a deletion (`materialize` /
 * `replace`) rewrites references, and references live in **two**
 * places: inside `designSystem` (alias values, style definitions) and
 * on node props (`appearance`). Rewriting both means two commit
 * helpers, therefore two `setData` dispatches, therefore two undos —
 * which is worse than not offering it. So a referenced token cannot be
 * deleted here, the panel says how many places reference it, and the
 * impact-absorbing dispositions wait for a commit path that can span
 * both carriers in one history entry. Nothing about the carrier blocks
 * it; this is a sequencing decision, not a limitation.
 */

import type {
	DesignSystem,
	DesignToken,
	StyleDefinition,
	TokenModeId,
	TokenType,
	TokenValue,
} from "@anvilkit/contracts/editor";
import { useCallback, useMemo, useState } from "react";
import { readNodeField } from "../../../../document-model/index.js";
import { ROOT_STYLE_TARGET_ID } from "../../../../puck/targets.js";
import { FALLBACK_TOKEN_MODE } from "../../tokens/token-mode.js";
import { useDocumentModel } from "../../use-document-model.js";
import { useTokenMode } from "../token-mode.js";
import { useAppearanceCommit } from "../use-appearance-commit.js";
import { useDesignSystemCommit } from "../use-design-system-commit.js";
import { useShellSelection } from "../use-shell-selection.js";
import { useWriteLayer } from "../write-layer.js";
import {
	type DesignSystemProjection,
	type DesignSystemTokenRow,
	readDesignSystem,
} from "./read-design-system.js";

/** What the Design System panel needs. */
export interface DesignSystemPanelState extends DesignSystemProjection {
	/** The node an attach/detach acts on; `null` when nothing is selected. */
	readonly primaryId: string | null;
	/**
	 * Style-definition ids in effect on the primary node's **root**
	 * target at the active write layer. Per-target attach is `ED-FA-005`
	 * (P1, deferred past R7), so the root target is the whole address
	 * here — see this file's note and the panel's doc comment.
	 */
	readonly attachedStyleIds: readonly string[];
	/**
	 * Whether the primary node declares the root style target, i.e.
	 * whether an attach would be accepted. `false` disables the control
	 * rather than letting it commit and be rejected (§8.5: never render
	 * a control whose commit the write path would refuse).
	 */
	readonly canAttach: boolean;
	/** Errors from the most recent commit, for inline display. */
	readonly lastErrors: readonly string[];
	/**
	 * The mode the canvas is compiling against and the mode a new alias
	 * is written into (`p5-007`, `ED-FA-006`).
	 *
	 * The shell holds an *override* — `undefined` until the author picks
	 * a mode — and the fallback resolved here is exactly the one
	 * `compileDocumentAppearance` applies to `tokenMode: undefined`
	 * (`root.props.designSystem.defaultTokenMode`). Panel and canvas
	 * therefore read the same value out of the same two inputs; this is
	 * a display of that value, not a second copy of it.
	 */
	readonly activeMode: TokenModeId;
	/**
	 * Preview another declared mode. Transient editor state: no
	 * history entry, nothing written to `Data`. Only the modes the
	 * document declares can be selected — the switch never mints an id,
	 * which is how the reservation on `light`/`dark` (ADR 0005 Part 2
	 * §5) stays intact.
	 */
	readonly setActiveMode: (modeId: TokenModeId) => void;

	readonly createToken: (input: {
		readonly name: string;
		readonly type: TokenType;
		readonly value: unknown;
	}) => void;
	readonly renameToken: (tokenId: string, name: string) => void;
	/** Write one mode's value — a literal or an alias. */
	readonly setTokenValue: (
		tokenId: string,
		modeId: TokenModeId,
		value: TokenValue<unknown>,
	) => void;
	/** Refused while anything still references the token (see above). */
	readonly deleteToken: (tokenId: string) => void;

	readonly createStyle: (name: string) => void;
	readonly renameStyle: (styleDefinitionId: string, name: string) => void;
	readonly deleteStyle: (styleDefinitionId: string) => void;
	/** Append to the primary node's root-target `styleRefs`. */
	readonly attachStyle: (styleDefinitionId: string) => void;
	readonly detachStyle: (styleDefinitionId: string) => void;
}

const NO_ERRORS: readonly string[] = Object.freeze([]);
const NO_IDS: readonly string[] = Object.freeze([]);

/**
 * The design system a document gets when it declares none and the
 * author creates their first token. Every member is declared, so the
 * result validates against `DesignSystemSchema` on the way in.
 */
const EMPTY_DESIGN_SYSTEM: DesignSystem = Object.freeze({
	breakpoints: [],
	tokens: {},
	tokenModes: {},
	defaultTokenMode: FALLBACK_TOKEN_MODE,
	styleDefinitions: {},
});

/** The live design system, projected, with its committers bound. */
export function useDesignSystemPanel(): DesignSystemPanelState {
	const model = useDocumentModel();
	const { primaryId } = useShellSelection();
	const { layer } = useWriteLayer();
	const { tokenMode, setTokenMode } = useTokenMode();
	const commitDesignSystem = useDesignSystemCommit();
	const commitAppearance = useAppearanceCommit();
	const [lastErrors, setLastErrors] = useState<readonly string[]>(NO_ERRORS);

	const projection = useMemo(
		() =>
			readDesignSystem({
				designSystem: model.designSystem,
				nodes: model.nodes,
				componentDefinitions: model.componentLibrary?.definitions,
			}),
		[model],
	);

	const canAttach =
		primaryId !== null &&
		(model.nodes
			.get(primaryId)
			?.styleTargets.some((target) => target.id === ROOT_STYLE_TARGET_ID) ??
			false);

	const attachedStyleIds =
		primaryId === null
			? NO_IDS
			: (() => {
					const read = readNodeField<readonly string[]>(model, {
						nodeIds: [primaryId],
						targetId: ROOT_STYLE_TARGET_ID,
						layer,
						field: "styleRefs",
					});
					return read.state.kind === "value" ? read.state.value : NO_IDS;
				})();

	/** One design-system intent → at most one history-recording commit. */
	const apply = useCallback(
		(
			update: (current: DesignSystem | undefined) => DesignSystem | undefined,
		) => {
			const result = commitDesignSystem(update);
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: NO_ERRORS,
			);
		},
		[commitDesignSystem],
	);

	/** Edit one existing token; a no-op when the token is gone. */
	const patchToken = useCallback(
		(tokenId: string, edit: (token: DesignToken) => DesignToken) => {
			apply((current) => {
				const token = current?.tokens[tokenId];
				if (current === undefined || token === undefined) return current;
				return {
					...current,
					tokens: { ...current.tokens, [tokenId]: edit(token) },
				};
			});
		},
		[apply],
	);

	const createToken = useCallback(
		(input: {
			readonly name: string;
			readonly type: TokenType;
			readonly value: unknown;
		}): void => {
			const name = input.name.trim();
			if (name.length === 0) return;
			apply((current) => {
				const base = current ?? EMPTY_DESIGN_SYSTEM;
				const token: DesignToken = {
					id: crypto.randomUUID(),
					// A dotted name becomes the path, so `color.brand.500`
					// groups under `color.brand` exactly as the author typed it.
					path: name.split(".").filter((segment) => segment !== ""),
					name,
					type: input.type,
					values: {
						[base.defaultTokenMode]: { kind: "literal", value: input.value },
					},
				};
				return { ...base, tokens: { ...base.tokens, [token.id]: token } };
			});
		},
		[apply],
	);

	const renameToken = useCallback(
		(tokenId: string, name: string): void => {
			const trimmed = name.trim();
			if (trimmed.length === 0) return;
			patchToken(tokenId, (token) => ({
				...token,
				name: trimmed,
				path: trimmed.split(".").filter((segment) => segment !== ""),
			}));
		},
		[patchToken],
	);

	const setTokenValue = useCallback(
		(
			tokenId: string,
			modeId: TokenModeId,
			value: TokenValue<unknown>,
		): void => {
			// A self-alias is refused here as well as excluded from the
			// picker's choices: the cheap structural guard is the one the UI
			// renders, this one is the guard against every other caller.
			if (value.kind === "alias" && value.tokenId === tokenId) return;
			patchToken(tokenId, (token) => ({
				...token,
				values: { ...token.values, [modeId]: value },
			}));
		},
		[patchToken],
	);

	const referencedTokenIds = useMemo(() => {
		const ids = new Set<string>();
		for (const group of projection.groups) {
			for (const row of group.tokens) {
				if (row.usageCount > 0) ids.add(row.token.id);
			}
		}
		return ids;
	}, [projection]);

	const deleteToken = useCallback(
		(tokenId: string): void => {
			if (referencedTokenIds.has(tokenId)) return;
			apply((current) => {
				if (current === undefined || current.tokens[tokenId] === undefined) {
					return current;
				}
				const { [tokenId]: _dropped, ...tokens } = current.tokens;
				return { ...current, tokens };
			});
		},
		[apply, referencedTokenIds],
	);

	const createStyle = useCallback(
		(name: string): void => {
			const trimmed = name.trim();
			if (trimmed.length === 0) return;
			apply((current) => {
				const base = current ?? EMPTY_DESIGN_SYSTEM;
				const timestamp = new Date().toISOString();
				const definition: StyleDefinition = {
					version: "1",
					id: crypto.randomUUID(),
					name: trimmed,
					appliesTo: "any",
					createdAt: timestamp,
					updatedAt: timestamp,
				};
				return {
					...base,
					styleDefinitions: {
						...base.styleDefinitions,
						[definition.id]: definition,
					},
				};
			});
		},
		[apply],
	);

	const renameStyle = useCallback(
		(styleDefinitionId: string, name: string): void => {
			const trimmed = name.trim();
			if (trimmed.length === 0) return;
			apply((current) => {
				const definition = current?.styleDefinitions[styleDefinitionId];
				if (current === undefined || definition === undefined) return current;
				return {
					...current,
					styleDefinitions: {
						...current.styleDefinitions,
						[styleDefinitionId]: {
							...definition,
							name: trimmed,
							updatedAt: new Date().toISOString(),
						},
					},
				};
			});
		},
		[apply],
	);

	const deleteStyle = useCallback(
		(styleDefinitionId: string): void => {
			apply((current) => {
				if (
					current === undefined ||
					current.styleDefinitions[styleDefinitionId] === undefined
				) {
					return current;
				}
				const { [styleDefinitionId]: _dropped, ...styleDefinitions } =
					current.styleDefinitions;
				return { ...current, styleDefinitions };
			});
		},
		[apply],
	);

	/** One `set-style-refs` patch on the primary node's root target. */
	const writeStyleRefs = useCallback(
		(next: readonly string[]) => {
			if (primaryId === null) return;
			const result = commitAppearance({
				config: model.config,
				nodeIds: [primaryId],
				targetId: ROOT_STYLE_TARGET_ID,
				layer,
				patch: {
					kind: "set-style-refs",
					value: next.length === 0 ? undefined : next,
				},
			});
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: NO_ERRORS,
			);
		},
		[commitAppearance, model.config, primaryId, layer],
	);

	const attachStyle = useCallback(
		(styleDefinitionId: string): void => {
			if (attachedStyleIds.includes(styleDefinitionId)) return;
			// Ordered multi-attach: precedence is list order (§11.3), so a
			// new attachment goes last and wins over the ones before it.
			writeStyleRefs([...attachedStyleIds, styleDefinitionId]);
		},
		[attachedStyleIds, writeStyleRefs],
	);

	const detachStyle = useCallback(
		(styleDefinitionId: string): void => {
			if (!attachedStyleIds.includes(styleDefinitionId)) return;
			writeStyleRefs(
				attachedStyleIds.filter((entry) => entry !== styleDefinitionId),
			);
		},
		[attachedStyleIds, writeStyleRefs],
	);

	return {
		...projection,
		primaryId,
		attachedStyleIds,
		canAttach,
		lastErrors,
		activeMode: tokenMode ?? projection.defaultMode,
		setActiveMode: setTokenMode,
		createToken,
		renameToken,
		setTokenValue,
		deleteToken,
		createStyle,
		renameStyle,
		deleteStyle,
		attachStyle,
		detachStyle,
	};
}

/** Whether a token may be deleted — nothing references it. */
export function canDeleteToken(row: DesignSystemTokenRow): boolean {
	return row.usageCount === 0;
}
