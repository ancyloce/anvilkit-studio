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

import type { DesignSystem, EditorError } from "@anvilkit/contracts/editor";
import { safeParseDesignSystem } from "@anvilkit/schema/editor";
import type { Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";
import { dispatchOneIntent, failureStatus } from "./commit-protocol.js";

/** Input to {@link updateDesignSystemInData}. */
export interface UpdateDesignSystemInput {
	readonly data: Data;
	/**
	 * The edit: receives the current validated design system (or
	 * `undefined` when the document has none) and returns the next one
	 * (`undefined` removes it). Must be pure.
	 */
	readonly update: (
		current: DesignSystem | undefined,
	) => DesignSystem | undefined;
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
function withDesignSystem(data: Data, next: DesignSystem | undefined): Data {
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
	let current: DesignSystem | undefined;
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
export interface DesignSystemCommitDeps extends WriterGateDep {
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
/**
 * Commit a design-system intent that ALSO carries node-level changes,
 * in ONE history entry (`p3-009`).
 *
 * Deleting a breakpoint is the case that needs this: §12.2 says the
 * breakpoint leaves `designSystem.breakpoints` *and* every node's
 * layered override at that breakpoint is merged to base or discarded.
 * Those are one author intent and must be one undo, but they touch a
 * root prop and the content tree — so the caller pre-applies the node
 * rewrite to a document and hands it in here, and the root-prop write
 * lands on top of it inside the same `setData`.
 *
 * `base` MUST be derived from the live document by a pure rewrite; the
 * functional updater re-derives nothing about it, so a caller that
 * passes a stale document would clobber a concurrent edit. Callers
 * that have no node-level half use {@link commitDesignSystemUpdate}.
 */
export function commitDesignSystemUpdateOver(
	deps: DesignSystemCommitDeps,
	base: Data,
	update: UpdateDesignSystemInput["update"],
): DesignSystemCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", errors: [gate] };
	}
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const result = updateDesignSystemInData({ data: base, update });
	if (result.status === "rejected") {
		return { status: "rejected", errors: result.errors };
	}
	const next = result.status === "updated" ? result.data : base;
	if (next === current) {
		return { status: "noop", errors: [] };
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: next,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return { status: "committed", errors: [] };
}

export function commitDesignSystemUpdate(
	deps: DesignSystemCommitDeps,
	update: UpdateDesignSystemInput["update"],
): DesignSystemCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", errors: [gate] };
	}
	const api = deps.getPuckApi();
	const attempt = dispatchOneIntent<UpdateDesignSystemResult>(api, (data) =>
		updateDesignSystemInData({ data, update }),
	);
	if (!attempt.committed) {
		return {
			status: failureStatus(attempt.outcome),
			errors: attempt.outcome.errors,
		};
	}
	return { status: "committed", errors: [] };
}
