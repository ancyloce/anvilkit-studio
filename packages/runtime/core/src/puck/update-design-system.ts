/**
 * @file Root design-system writes over the same `setData` path
 * (PLAN-0025 §8.3, P2-05). Pure, React-free.
 *
 * Document-level render state lives in declared root props (§4.1), so
 * token, token-mode, breakpoint, and style-definition edits update
 * `root.props.designSystem` through the SAME protocol node appearance
 * uses: validate first, one history-recording functional-updater
 * `setData` dispatch per intent, no dispatch on no-op or rejection,
 * and never `replaceRoot` (P2-00 decision; §15 gate 4).
 *
 * The edit itself is a functional `update(current) → next` so every
 * caller — StylePanel's design tab, `plugin-design-system` after its
 * Phase 3.5 adaptation — expresses arbitrary token/definition edits
 * without this module growing a bespoke patch grammar. The result is
 * schema-validated before anything writes; `undefined` removes the
 * prop entirely (canonical absence, like appearance).
 */

import type { DesignSystemV1, EditorError } from "@anvilkit/contracts/editor";
import { safeParseDesignSystem } from "@anvilkit/schema/editor";
import type { Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";

/** Input to {@link updateDesignSystemInData}. */
export interface UpdateDesignSystemInput {
	readonly data: Data;
	/**
	 * The edit: receives the current validated design system (or
	 * `undefined` when the document has none) and returns the next one
	 * (`undefined` removes it). Must be pure.
	 */
	readonly update: (
		current: DesignSystemV1 | undefined,
	) => DesignSystemV1 | undefined;
}

/** Outcome of the pure update. */
export interface UpdateDesignSystemResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

function rawDesignSystemOf(data: Data): unknown {
	return (data.root?.props as { designSystem?: unknown } | undefined)
		?.designSystem;
}

/** Produce the next document with `root.props.designSystem` replaced. */
function withDesignSystem(data: Data, next: DesignSystemV1 | undefined): Data {
	const root = (data.root ?? {}) as { props?: Record<string, unknown> };
	const { designSystem: _dropped, ...restProps } = root.props ?? {};
	return {
		...data,
		root: {
			...root,
			props:
				next === undefined ? restProps : { ...restProps, designSystem: next },
		},
	} as Data;
}

/**
 * The pure root update: parse, edit, validate, compare. An existing
 * `designSystem` that fails validation is refused, not overwritten —
 * same conservatism as node appearance (P2-04).
 */
export function updateDesignSystemInData(
	input: UpdateDesignSystemInput,
): UpdateDesignSystemResult {
	const errors: EditorError[] = [];
	const reject = (): UpdateDesignSystemResult => ({
		data: input.data,
		status: "rejected",
		errors,
	});

	const raw = rawDesignSystemOf(input.data);
	let current: DesignSystemV1 | undefined;
	if (raw !== undefined) {
		const parsed = safeParseDesignSystem(raw);
		if (!parsed.success) {
			errors.push(
				makeEditorError(
					"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
					"root.props.designSystem fails validation; refusing to overwrite it",
				),
			);
			return reject();
		}
		current = parsed.data;
	}

	const next = input.update(current);
	if (next !== undefined) {
		const validated = safeParseDesignSystem(next);
		if (!validated.success) {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					"the updated design system fails schema validation",
					{ details: { issues: validated.error.issues.length } },
				),
			);
			return reject();
		}
	}

	if (deepEqualJson(raw, next)) {
		return { data: input.data, status: "noop", errors: [] };
	}
	return {
		data: withDesignSystem(input.data, next),
		status: "updated",
		errors: [],
	};
}

/** Dependencies of {@link commitDesignSystemUpdate}. */
export interface DesignSystemCommitDeps {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a commit attempt. */
export interface DesignSystemCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/**
 * Commit one design-system intent through ONE history-recording
 * functional-updater `setData` dispatch — the same action protocol as
 * appearance commits, so undo/redo restores root design-system edits
 * exactly (§14.2). No dispatch on no-op or rejection.
 */
export function commitDesignSystemUpdate(
	deps: DesignSystemCommitDeps,
	update: UpdateDesignSystemInput["update"],
): DesignSystemCommitResult {
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const result = updateDesignSystemInData({ data: current, update });
	if (result.status !== "updated") {
		return {
			status: result.status === "noop" ? "noop" : "rejected",
			errors: result.errors,
		};
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) =>
			previous === current
				? result.data
				: updateDesignSystemInData({ data: previous, update }).data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return { status: "committed", errors: [] };
}
