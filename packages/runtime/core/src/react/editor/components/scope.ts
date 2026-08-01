"use client";

/**
 * @file Isolated component editing scope (PLAN-0020 CORE-P2-009E;
 * DD-DEC-010; DD-0019 §14.4, §10.6; contract freeze CORE-P0-001 §6).
 *
 * Three rules, all of them freeze §6:
 *
 * 1. **Scope is transient UI state.** It lives on
 *    `EditorSelectionState.scope`, never in `AuthoringStateV1`, so
 *    entering or leaving a component creates **no** history entry and
 *    survives no reload. The pure reducer stays scope-independent.
 * 2. **Selections never span scopes** (§10.6) — enforced by the
 *    selection store, which clears on every scope change.
 * 3. **Definition edits are routed through main-component mode by the
 *    UI**, not by the reducer. This module supplies the guard the
 *    command port applies, so a definition edit dispatched while the
 *    page scope is active is rejected before it can commit rather
 *    than relying on the affordance simply not being rendered.
 */

import type {
	EditorCommand,
	EditorError,
	EditorSelectionState,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../../../editor/index.js";

/** The commands that edit a definition and so require its scope. */
const DEFINITION_EDIT_TYPES = new Set<string>([
	"component.definition.update",
	"component.override.promote",
]);

/** `component:<definitionId>` for an isolated scope. */
export function componentScope(definitionId: string): `component:${string}` {
	return `component:${definitionId}`;
}

/** The definition id an isolated scope is editing, if any. */
export function scopedDefinitionId(
	scope: EditorSelectionState["scope"],
): string | undefined {
	return scope === "page" ? undefined : scope.slice("component:".length);
}

/**
 * Reject a definition edit issued outside the matching
 * main-component scope (freeze §6).
 *
 * Returns `null` when the command is allowed. Batches are checked
 * member-wise: one out-of-scope member rejects the whole transaction,
 * which is what all-or-nothing batching requires.
 */
export function scopeGuardError(
	scope: EditorSelectionState["scope"],
	command: EditorCommand,
	definitionIdOf: (command: EditorCommand) => string | undefined,
): EditorError | null {
	const members = command.type === "batch" ? command.commands : [command];
	for (const member of members) {
		if (!DEFINITION_EDIT_TYPES.has(member.type)) {
			continue;
		}
		const targetId = definitionIdOf(member);
		const active = scopedDefinitionId(scope);
		if (targetId !== undefined && active === targetId) {
			continue;
		}
		return makeEditorError(
			"EDITOR_CAPABILITY_UNSUPPORTED",
			`"${member.type}" edits a component definition and requires its isolated editing scope`,
			{
				details: {
					reason: "definition-edit-outside-scope",
					commandType: member.type,
					definitionId: targetId,
					activeScope: scope,
				},
			},
		);
	}
	return null;
}

/** Enter/leave isolated component editing (DD-DEC-010). */
export interface EditorScopeController {
	readonly getScope: () => EditorSelectionState["scope"];
	/** The definition being edited in isolation, or `undefined`. */
	readonly getDefinitionId: () => string | undefined;
	/**
	 * Enter a component's isolated scope. Clears the selection
	 * (§10.6) and records nothing in history.
	 */
	readonly enterComponent: (definitionId: string) => void;
	/** Return to page scope, restoring the prior page selection. */
	readonly exitScope: () => void;
}

/** What the controller needs from the selection store. */
export interface ScopeControllerDeps {
	readonly getSelection: () => EditorSelectionState;
	readonly setScope: (scope: EditorSelectionState["scope"]) => void;
	readonly selectMany: (nodeIds: readonly string[]) => void;
}

/**
 * One shared scope controller per selection controller.
 *
 * The remembered page selection is closure state, so two independently
 * created controllers over the same selection store each remember
 * *their own* entry selection — and the surface that enters (the
 * Components panel) is not the surface that exits (the component
 * canvas breadcrumb), so exiting restored nothing. Keying the
 * controller by its selection store makes "enter here, leave there"
 * work, which is the only way a user actually navigates.
 *
 * A `WeakMap` so a torn-down `<Studio>` instance is collectable.
 */
const SHARED_CONTROLLERS = new WeakMap<object, EditorScopeController>();

/**
 * The scope controller for a selection store, created once and shared.
 *
 * `owner` is the identity the controller is cached under — pass the
 * selection controller itself.
 */
export function getEditorScopeController(
	owner: object,
	deps: ScopeControllerDeps,
): EditorScopeController {
	const existing = SHARED_CONTROLLERS.get(owner);
	if (existing !== undefined) {
		return existing;
	}
	const created = createEditorScopeController(deps);
	SHARED_CONTROLLERS.set(owner, created);
	return created;
}

/**
 * Build the scope controller.
 *
 * Exiting restores the page selection that was active on entry —
 * navigation should feel like stepping back out, not like losing your
 * place. The remembered selection is plain closure state: it is UI
 * convenience, so persisting it would be wrong. Callers that need the
 * memory shared across surfaces use {@link getEditorScopeController}.
 */
export function createEditorScopeController(
	deps: ScopeControllerDeps,
): EditorScopeController {
	let pageSelection: readonly string[] = [];

	return {
		getScope: () => deps.getSelection().scope,
		getDefinitionId: () => scopedDefinitionId(deps.getSelection().scope),

		enterComponent(definitionId) {
			const current = deps.getSelection();
			if (current.scope === "page") {
				pageSelection = current.selectedIds;
			}
			// `setScope` clears the selection itself (§10.6).
			deps.setScope(componentScope(definitionId));
		},

		exitScope() {
			if (deps.getSelection().scope === "page") {
				return;
			}
			deps.setScope("page");
			if (pageSelection.length > 0) {
				deps.selectMany(pageSelection);
			}
			pageSelection = [];
		},
	};
}
