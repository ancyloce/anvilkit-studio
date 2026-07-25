/**
 * @file Pure command validation for the Phase 0/1A subset
 * (PLAN-0020 CORE-P0-008; DD-0019 §24.2; contract freeze
 * CORE-P0-001 §8).
 *
 * Validates what is knowable from `AuthoringStateV1` alone. Node
 * *existence* in the Puck tree is deliberately not checked here —
 * authoring records exist only for nodes with non-default state
 * (invariant 3), so a fresh node legitimately has no record; the
 * command port (Phase 1A) validates tree membership and locked
 * ancestors, both of which require the tree.
 */

import type {
	AtomicEditorCommand,
	AuthoringStateV1,
	DesignToken,
	EditorCommand,
	EditorError,
	EditorPatch,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import {
	DesignTokenSchema,
	LayoutSpecSchema,
	TypographySpecSchema,
	VisualStyleSpecSchema,
} from "@anvilkit/schema/editor";
import { makeEditorError } from "../diagnostics.js";
import { stripPatchNulls } from "../patch.js";
import { planTokenDeletion } from "../tokens/deletion.js";
import { checkTokenAliasGraph } from "../tokens/graph.js";
import { applyTokenPatch } from "../tokens/patch.js";

/** The command types whose reducers have shipped. */
const IMPLEMENTED_TYPES = new Set<string>([
	// Phase 0/1A
	"node.layout.set",
	"node.style.set",
	"node.typography.set",
	"node.visibility.set",
	"node.lock.set",
	"node.rename",
	"node.responsiveOverride.set",
	"breakpoints.set",
	"batch",
	// Phase 2 — tokens (CORE-P2-001)
	"token.create",
	"token.update",
	"token.delete",
]);

/** §12.2 invariants for the breakpoint set (CORE-P1A-008). */
const BREAKPOINT_MAX_COUNT = 8;
const BREAKPOINT_MIN_WIDTH = 240;
const BREAKPOINT_MAX_WIDTH = 7680;

function breakpointSetErrors(
	breakpoints: readonly AuthoringStateV1["breakpoints"][number][],
): readonly EditorError[] {
	const errors: EditorError[] = [];
	if (breakpoints.length > BREAKPOINT_MAX_COUNT) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`documents allow at most ${BREAKPOINT_MAX_COUNT} breakpoints`,
				{
					details: {
						limitKey: "breakpoints",
						limit: BREAKPOINT_MAX_COUNT,
						actual: breakpoints.length,
					},
				},
			),
		);
	}
	const ids = new Set<string>();
	const widths = new Set<number>();
	for (const breakpoint of breakpoints) {
		if (breakpoint.id === "base" || breakpoint.id.length === 0) {
			errors.push(
				makeEditorError(
					"EDITOR_BREAKPOINT_INVALID",
					'breakpoint ids must be non-empty and never the reserved literal "base"',
					{ details: { breakpointId: breakpoint.id } },
				),
			);
		}
		if (ids.has(breakpoint.id)) {
			errors.push(
				makeEditorError(
					"EDITOR_BREAKPOINT_INVALID",
					`duplicate breakpoint id "${breakpoint.id}"`,
					{ details: { breakpointId: breakpoint.id, reason: "duplicate-id" } },
				),
			);
		}
		ids.add(breakpoint.id);
		if (
			!Number.isInteger(breakpoint.maxWidth) ||
			breakpoint.maxWidth < BREAKPOINT_MIN_WIDTH ||
			breakpoint.maxWidth > BREAKPOINT_MAX_WIDTH
		) {
			errors.push(
				makeEditorError(
					"EDITOR_BREAKPOINT_INVALID",
					`breakpoint "${breakpoint.id}" maxWidth must be an integer ${BREAKPOINT_MIN_WIDTH}–${BREAKPOINT_MAX_WIDTH}`,
					{
						details: {
							breakpointId: breakpoint.id,
							maxWidth: breakpoint.maxWidth,
						},
					},
				),
			);
		}
		if (widths.has(breakpoint.maxWidth)) {
			errors.push(
				makeEditorError(
					"EDITOR_BREAKPOINT_INVALID",
					`duplicate breakpoint maxWidth ${breakpoint.maxWidth}`,
					{
						details: {
							breakpointId: breakpoint.id,
							maxWidth: breakpoint.maxWidth,
							reason: "duplicate-width",
						},
					},
				),
			);
		}
		widths.add(breakpoint.maxWidth);
	}
	return errors;
}

/**
 * Shared shape/limit/graph checks for a prospective token write. The
 * caller supplies the token map the document would have, so cycles and
 * cross-type aliases are caught before commit (invariant 8).
 */
function tokenWriteErrors(
	state: AuthoringStateV1,
	tokenId: string,
	token: DesignToken,
	nextTokens: Readonly<Record<string, DesignToken>>,
): readonly EditorError[] {
	const errors: EditorError[] = [];
	const parsed = DesignTokenSchema.safeParse(token);
	if (!parsed.success) {
		errors.push(
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				`token "${tokenId}" is not a valid DesignToken`,
				{
					details: {
						kind: "token",
						tokenId,
						issueCount: parsed.error?.issues.length ?? 0,
						firstPath: parsed.error?.issues[0]?.path.map(String) ?? [],
					},
				},
			),
		);
	}
	errors.push(...checkTokenAliasGraph(tokenId, nextTokens, state.tokenModes));
	return errors;
}

function tokenCreateErrors(
	state: AuthoringStateV1,
	token: DesignToken,
): readonly EditorError[] {
	const errors: EditorError[] = [];
	if (state.tokens[token.id] !== undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_COMMAND_CONFLICT",
				`token "${token.id}" already exists`,
				{
					details: { kind: "token", tokenId: token.id, reason: "duplicate-id" },
				},
			),
		);
		// A duplicate id makes the prospective graph meaningless; the
		// remaining checks would report against the wrong token.
		return errors;
	}
	const count = Object.keys(state.tokens).length + 1;
	if (count > EDITOR_COUNT_LIMITS.tokens) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`documents allow at most ${EDITOR_COUNT_LIMITS.tokens} tokens`,
				{
					details: {
						limitKey: "tokens",
						limit: EDITOR_COUNT_LIMITS.tokens,
						actual: count,
					},
				},
			),
		);
	}
	errors.push(
		...tokenWriteErrors(state, token.id, token, {
			...state.tokens,
			[token.id]: token,
		}),
	);
	return errors;
}

function tokenUpdateErrors(
	state: AuthoringStateV1,
	tokenId: string,
	patch: EditorPatch<Omit<DesignToken, "id">>,
): readonly EditorError[] {
	const current = state.tokens[tokenId];
	if (current === undefined) {
		return [
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`token "${tokenId}" is not in this document`,
				{ details: { kind: "token", tokenId } },
			),
		];
	}
	const next = applyTokenPatch(current, patch);
	return tokenWriteErrors(state, tokenId, next, {
		...state.tokens,
		[tokenId]: next,
	});
}

function layerErrors(
	state: AuthoringStateV1,
	layer: ResponsiveLayerRef,
	allowBase: boolean,
): readonly EditorError[] {
	if (layer === "base") {
		return allowBase
			? []
			: [
					makeEditorError(
						"EDITOR_BREAKPOINT_INVALID",
						'the base layer is not an override target ("base" is invalid here)',
					),
				];
	}
	const breakpoint = state.breakpoints.find((entry) => entry.id === layer);
	if (breakpoint === undefined || !breakpoint.enabled) {
		return [
			makeEditorError(
				"EDITOR_BREAKPOINT_INVALID",
				`breakpoint "${layer}" does not exist or is disabled`,
				{ details: { breakpointId: layer } },
			),
		];
	}
	return [];
}

function lockedErrors(
	state: AuthoringStateV1,
	nodeIds: readonly string[],
): readonly EditorError[] {
	const locked = nodeIds.filter(
		(nodeId) => state.nodes[nodeId]?.locked === true,
	);
	if (locked.length === 0) {
		return [];
	}
	return [
		makeEditorError("EDITOR_NODE_LOCKED", "mutation targets locked nodes", {
			nodeIds: locked,
		}),
	];
}

function nodeIdsErrors(nodeIds: readonly string[]): readonly EditorError[] {
	if (nodeIds.length === 0) {
		return [
			makeEditorError("EDITOR_NODE_NOT_FOUND", "command targets no nodes", {
				details: { reason: "empty-nodeIds" },
			}),
		];
	}
	return [];
}

function patchErrors(
	patch: unknown,
	schema: {
		safeParse: (value: unknown) => {
			success: boolean;
			error?: { issues: readonly { path: PropertyKey[] }[] };
		};
	},
): readonly EditorError[] {
	const stripped = stripPatchNulls(patch);
	const parsed = schema.safeParse(stripped);
	if (parsed.success) {
		return [];
	}
	return [
		makeEditorError(
			"EDITOR_INVALID_CSS_VALUE",
			"patch contains invalid typed CSS values",
			{
				details: {
					issueCount: parsed.error?.issues.length ?? 0,
					firstPath: parsed.error?.issues[0]?.path.map(String) ?? [],
				},
			},
		),
	];
}

/**
 * Validate one atomic command against a state snapshot. Returns all
 * errors found (info/warning entries never block; the reducer
 * pipeline rejects on any `severity: "error"`).
 */
export function validateAtomicCommand(
	state: AuthoringStateV1,
	command: AtomicEditorCommand,
): readonly EditorError[] {
	if (!IMPLEMENTED_TYPES.has(command.type)) {
		return [
			makeEditorError(
				"EDITOR_CAPABILITY_UNSUPPORTED",
				`command type "${command.type}" is not available in this build phase`,
				{ details: { kind: "command", commandType: command.type } },
			),
		];
	}
	switch (command.type) {
		case "node.layout.set":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.breakpointId, true),
				...patchErrors(command.patch, LayoutSpecSchema),
			];
		case "node.style.set":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.breakpointId, true),
				...patchErrors(command.patch, VisualStyleSpecSchema),
			];
		case "node.typography.set":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.breakpointId, true),
				...patchErrors(command.patch, TypographySpecSchema),
			];
		case "node.visibility.set":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.breakpointId, true),
			];
		case "node.lock.set":
			// Locking/unlocking is exempt from the locked-node rejection —
			// unlocking a locked node must be possible (freeze §8).
			return nodeIdsErrors(command.nodeIds);
		case "node.rename":
			return lockedErrors(state, [command.nodeId]);
		case "node.responsiveOverride.set":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.breakpointId, false),
			];
		case "breakpoints.set":
			return breakpointSetErrors(command.breakpoints);
		case "token.create":
			return tokenCreateErrors(state, command.token);
		case "token.update":
			return tokenUpdateErrors(state, command.tokenId, command.patch);
		case "token.delete":
			// The preview and the commit run the same planner, so an
			// approved plan is exactly what validation accepts.
			return planTokenDeletion(state, command.tokenId, command.disposition, {
				tokenMode: command.tokenMode,
			}).errors.filter((error) => error.severity === "error");
		default:
			return [];
	}
}

/**
 * Validate a command (atomic or batch shell). Batch members are
 * validated sequentially against intermediate state by the apply
 * pipeline, not here — this validates only the batch envelope.
 */
export function validateEditorCommand(
	state: AuthoringStateV1,
	command: EditorCommand,
): readonly EditorError[] {
	if (command.type === "batch") {
		const errors: EditorError[] = [];
		if (command.commands.length === 0) {
			errors.push(
				makeEditorError("EDITOR_COMMAND_CONFLICT", "batch has no commands", {
					details: { reason: "empty-batch" },
				}),
			);
		}
		if (command.commands.length > EDITOR_COUNT_LIMITS.commandsPerBatch) {
			errors.push(
				makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`batch exceeds ${EDITOR_COUNT_LIMITS.commandsPerBatch} commands`,
					{
						details: {
							limitKey: "commandsPerBatch",
							limit: EDITOR_COUNT_LIMITS.commandsPerBatch,
							actual: command.commands.length,
						},
					},
				),
			);
		}
		for (const [index, member] of command.commands.entries()) {
			if ((member as { type: string }).type === "batch") {
				errors.push(
					makeEditorError("EDITOR_COMMAND_CONFLICT", "batches must not nest", {
						details: { batchIndex: index, reason: "nested-batch" },
					}),
				);
			}
		}
		return errors;
	}
	return validateAtomicCommand(state, command);
}
