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
	EditorPolicies,
	ResponsiveLayerRef,
	StyleDefinitionV1,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import {
	DesignTokenSchema,
	LayoutSpecSchema,
	StyleDefinitionSchema,
	TypographySpecSchema,
	VisualStyleSpecSchema,
} from "@anvilkit/schema/editor";
import { makeEditorError } from "../diagnostics.js";
import { stripPatchNulls } from "../patch.js";
import { validateDefinitionDelete } from "../components/lifecycle.js";
import { applyComponentDefinitionPatch } from "../components/patch.js";
import { validateVariantModel } from "../components/variants.js";
import { applyStyleDefinitionPatch } from "../styles/patch.js";
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
	// Phase 2 — reusable style definitions (CORE-P2-003)
	"styleDefinition.create",
	"styleDefinition.attach",
	"styleDefinition.update",
	"styleDefinition.detach",
	"styleDefinition.delete",
	// Phase 2 — instance editing (CORE-P2-006)
	"component.instance.propOverride.set",
	"component.instance.nodeOverride.set",
	// Phase 2 — definition lifecycle (CORE-P2-007)
	"component.definition.delete",
	// Phase 2 — override reset granularity (CORE-P2-008)
	"component.override.reset",
	"component.override.resetAll",
	"component.override.promote",
	// Phase 2 — variant model (CORE-P2-009A)
	"component.definition.update",
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

function missingStyleDefinitionErrors(
	state: AuthoringStateV1,
	styleDefinitionId: string,
): readonly EditorError[] {
	if (state.styleDefinitions[styleDefinitionId] !== undefined) {
		return [];
	}
	return [
		makeEditorError(
			"EDITOR_NODE_NOT_FOUND",
			`style definition "${styleDefinitionId}" is not in this document`,
			{ details: { kind: "styleDefinition", id: styleDefinitionId } },
		),
	];
}

function styleDefinitionShapeErrors(
	styleDefinitionId: string,
	definition: StyleDefinitionV1,
): readonly EditorError[] {
	const parsed = StyleDefinitionSchema.safeParse(definition);
	if (parsed.success) {
		return [];
	}
	return [
		makeEditorError(
			"EDITOR_INVALID_CSS_VALUE",
			`style definition "${styleDefinitionId}" is not valid`,
			{
				details: {
					kind: "styleDefinition",
					id: styleDefinitionId,
					issueCount: parsed.error?.issues.length ?? 0,
					firstPath: parsed.error?.issues[0]?.path.map(String) ?? [],
				},
			},
		),
	];
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
 * Options a caller threads into validation.
 *
 * `entryState` is the state the *transaction* began at. It matters
 * only for `"block-when-referenced"` definition deletes, whose policy
 * check must not be fooled by a batch that detaches first (contract
 * freeze CORE-P0-001 §4).
 */
export interface ValidateCommandOptions {
	readonly policies?: EditorPolicies;
	readonly entryState?: AuthoringStateV1;
}

/**
 * Validate one atomic command against a state snapshot. Returns all
 * errors found (info/warning entries never block; the reducer
 * pipeline rejects on any `severity: "error"`).
 */
export function validateAtomicCommand(
	state: AuthoringStateV1,
	command: AtomicEditorCommand,
	options: ValidateCommandOptions = {},
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
		case "styleDefinition.create": {
			const errors: EditorError[] = [];
			if (state.styleDefinitions[command.definition.id] !== undefined) {
				errors.push(
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						`style definition "${command.definition.id}" already exists`,
						{
							details: {
								kind: "styleDefinition",
								id: command.definition.id,
								reason: "duplicate-id",
							},
						},
					),
				);
				return errors;
			}
			const count = Object.keys(state.styleDefinitions).length + 1;
			if (count > EDITOR_COUNT_LIMITS.styleDefinitions) {
				errors.push(
					makeEditorError(
						"EDITOR_LIMIT_EXCEEDED",
						`documents allow at most ${EDITOR_COUNT_LIMITS.styleDefinitions} style definitions`,
						{
							details: {
								limitKey: "styleDefinitions",
								limit: EDITOR_COUNT_LIMITS.styleDefinitions,
								actual: count,
							},
						},
					),
				);
			}
			errors.push(
				...styleDefinitionShapeErrors(
					command.definition.id,
					command.definition,
				),
			);
			return errors;
		}
		case "styleDefinition.attach":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.layer, true),
				...missingStyleDefinitionErrors(state, command.styleDefinitionId),
			];
		case "styleDefinition.detach":
			return [
				...nodeIdsErrors(command.nodeIds),
				...lockedErrors(state, command.nodeIds),
				...layerErrors(state, command.layer, true),
			];
		case "styleDefinition.update": {
			const current = state.styleDefinitions[command.styleDefinitionId];
			if (current === undefined) {
				return missingStyleDefinitionErrors(state, command.styleDefinitionId);
			}
			return styleDefinitionShapeErrors(
				command.styleDefinitionId,
				applyStyleDefinitionPatch(current, command.patch),
			);
		}
		case "styleDefinition.delete":
			return missingStyleDefinitionErrors(state, command.styleDefinitionId);
		case "component.instance.propOverride.set":
		case "component.instance.nodeOverride.set": {
			const record = state.nodes[command.instanceNodeId];
			const instance = record?.componentInstance;
			if (instance === undefined) {
				return [
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`node "${command.instanceNodeId}" is not a component instance`,
						{
							nodeIds: [command.instanceNodeId],
							details: { kind: "componentInstance" },
						},
					),
				];
			}
			const errors: EditorError[] = [
				...lockedErrors(state, [command.instanceNodeId]),
			];
			if (state.componentDefinitions[instance.definitionId] === undefined) {
				errors.push(
					makeEditorError(
						"EDITOR_DEFINITION_UNAVAILABLE",
						`definition "${instance.definitionId}" is not in this document`,
						{
							nodeIds: [command.instanceNodeId],
							details: { kind: "componentDefinition" },
						},
					),
				);
				return errors;
			}
			if (command.type === "component.instance.nodeOverride.set") {
				// Override keys are bare definition node ids — never the
				// runtime composite form (§14.2).
				if (command.definitionNodeId.includes("::")) {
					errors.push(
						makeEditorError(
							"EDITOR_CAPABILITY_UNSUPPORTED",
							"node overrides address bare definition node ids, not runtime ids",
							{ details: { reason: "runtime-id-as-override-key" } },
						),
					);
				}
			}
			return errors;
		}
		case "component.override.reset":
		case "component.override.promote": {
			const instance = state.nodes[command.instanceNodeId]?.componentInstance;
			if (instance === undefined) {
				return [
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`node "${command.instanceNodeId}" is not a component instance`,
						{
							nodeIds: [command.instanceNodeId],
							details: { kind: "componentInstance" },
						},
					),
				];
			}
			if (command.target.propertyPath.length === 0) {
				return [
					makeEditorError(
						"EDITOR_CAPABILITY_UNSUPPORTED",
						"override addresses require at least one path segment",
						{ details: { reason: "empty-property-path" } },
					),
				];
			}
			if (command.type === "component.override.promote") {
				// Promote is a definition edit; an unresolvable definition
				// has nothing to write into (freeze §8).
				if (
					state.componentDefinitions[instance.definitionId] === undefined
				) {
					return [
						makeEditorError(
							"EDITOR_DEFINITION_UNAVAILABLE",
							`definition "${instance.definitionId}" is not in this document`,
							{
								nodeIds: [command.instanceNodeId],
								details: { kind: "componentDefinition" },
							},
						),
					];
				}
			}
			return lockedErrors(state, [command.instanceNodeId]);
		}
		case "component.override.resetAll":
			return [
				...nodeIdsErrors(command.instanceNodeIds),
				...lockedErrors(state, command.instanceNodeIds),
			];
		case "component.definition.update": {
			const definition = state.componentDefinitions[command.definitionId];
			if (definition === undefined) {
				return [
					makeEditorError(
						"EDITOR_DEFINITION_UNAVAILABLE",
						`component definition "${command.definitionId}" is not in this document`,
						{
							details: {
								kind: "componentDefinition",
								definitionId: command.definitionId,
							},
						},
					),
				];
			}
			// Validate the definition the document *would* have, so an
			// ambiguous variant model can never be committed.
			return validateVariantModel(
				applyComponentDefinitionPatch(definition, command.patch),
			);
		}
		case "component.definition.delete":
			return validateDefinitionDelete(
				state,
				command.definitionId,
				options.policies?.componentDefinitionDelete ?? "confirm-detach-all",
				options.entryState ?? state,
			);
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
	options: ValidateCommandOptions = {},
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
	return validateAtomicCommand(state, command, options);
}
