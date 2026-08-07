/**
 * @file `editorAnnotations` root-prop writes (PLAN-0026 §3.6, ADR 0007
 * decision 1; DD-0019 `ED-FA-015`). Pure and React-free.
 *
 * Layer rename and lock were dropped during P6-00 as having "no v2
 * equivalent", leaving a recorded LayersPanel UX regression. They come
 * back here as a **declared root prop** — the sanctioned document-level
 * home (contract rule 2) — under two non-negotiable conditions:
 *
 * 1. **The shape is permanently closed.** `Record<nodeId, { name?,
 *    locked? }>` and nothing else, validated with `strictObject` so an
 *    unknown key inside an entry is a validation error. An annotations
 *    map that accepts arbitrary keys is the sidecar again under a new
 *    name. Widening it needs the same scrutiny as adding a root prop.
 * 2. **Annotations never reach an exporter.** They are stripped at the
 *    single IR boundary (`@anvilkit/ir`'s `puck-data-to-ir.ts`), so
 *    every current and future format inherits the strip rather than
 *    each format remembering to delete them.
 *
 * Render-neutral by construction: the compiler and `<Render>` read
 * `appearance`, `designSystem` and `componentLibrary`, none of which
 * this touches — so the four consumers see identical output with or
 * without annotations (rule 3).
 *
 * Protocol is the established one: validate first, one functional
 * `setData` with `recordHistory: true` per intent, no dispatch on a
 * no-op or rejection, never `replaceRoot`.
 */

import type {
	EditorAnnotation,
	EditorAnnotations,
	EditorError,
} from "@anvilkit/contracts/editor";
import { EDITOR_ANNOTATIONS_PROP } from "@anvilkit/contracts/editor";
import type { Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import { parseEditorAnnotations } from "./read-appearance.js";

/** One annotation intent. */
export type AnnotationEdit =
	| { readonly kind: "rename"; readonly nodeId: string; readonly name: string }
	/** `undefined` clears the custom name, restoring the default label. */
	| { readonly kind: "clear-name"; readonly nodeId: string }
	| {
			readonly kind: "set-locked";
			readonly nodeId: string;
			readonly locked: boolean;
	  };

/** Input to {@link updateAnnotationsInData}. */
export interface UpdateAnnotationsInput {
	readonly data: Data;
	readonly edit: AnnotationEdit;
}

/** Outcome of an annotations write. */
export interface UpdateAnnotationsResult {
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

function rawAnnotationsOf(data: Data): unknown {
	return (data.root?.props as Record<string, unknown> | undefined)?.[
		EDITOR_ANNOTATIONS_PROP
	];
}

/** Produce the next document with the annotations root prop replaced. */
function withAnnotations(
	data: Data,
	next: EditorAnnotations | undefined,
): Data {
	const root = (data.root ?? {}) as { props?: Record<string, unknown> };
	const { [EDITOR_ANNOTATIONS_PROP]: _dropped, ...restProps } =
		root.props ?? {};
	return {
		...data,
		root: {
			...root,
			props:
				next === undefined
					? restProps
					: { ...restProps, [EDITOR_ANNOTATIONS_PROP]: next },
		},
	} as Data;
}

/** Apply one edit to an entry; `undefined` removes the entry. */
function applyEdit(
	current: EditorAnnotation | undefined,
	edit: AnnotationEdit,
): EditorAnnotation | undefined {
	const base: { name?: string; locked?: boolean } = { ...(current ?? {}) };
	if (edit.kind === "rename") base.name = edit.name;
	else if (edit.kind === "clear-name") delete base.name;
	else if (edit.locked) base.locked = true;
	else delete base.locked;
	// An entry with nothing left in it is removed rather than stored as
	// `{}` — canonical absence, the same rule appearance follows.
	return base.name === undefined && base.locked === undefined
		? undefined
		: base;
}

/** The pure annotations update: parse, edit, validate, compare. */
export function updateAnnotationsInData(
	input: UpdateAnnotationsInput,
): UpdateAnnotationsResult {
	const raw = rawAnnotationsOf(input.data);
	let current: EditorAnnotations = {};
	if (raw !== undefined) {
		const parsed = parseEditorAnnotations(raw);
		if (parsed === undefined) {
			// Refused, not overwritten — the same conservatism appearance
			// and the design system apply.
			return {
				data: input.data,
				status: "rejected",
				errors: [
					makeEditorError(
						"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
						`root.props.${EDITOR_ANNOTATIONS_PROP} fails validation; refusing to overwrite it`,
					),
				],
			};
		}
		current = parsed;
	}

	const nextEntry = applyEdit(current[input.edit.nodeId], input.edit);
	const { [input.edit.nodeId]: _gone, ...rest } = current;
	const nextMap: Record<string, EditorAnnotation> =
		nextEntry === undefined ? rest : { ...rest, [input.edit.nodeId]: nextEntry };
	const next: EditorAnnotations | undefined =
		Object.keys(nextMap).length === 0 ? undefined : nextMap;

	if (next !== undefined && parseEditorAnnotations(next) === undefined) {
		return {
			data: input.data,
			status: "rejected",
			errors: [
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					"the updated editor annotations fail schema validation",
				),
			],
		};
	}
	if (deepEqualJson(raw, next)) {
		return { data: input.data, status: "noop", errors: [] };
	}
	return {
		data: withAnnotations(input.data, next),
		status: "updated",
		errors: [],
	};
}

/** Whether a node is locked, read from the declared root prop. */
export function isNodeLocked(data: Data, nodeId: string): boolean {
	const parsed = parseEditorAnnotations(rawAnnotationsOf(data));
	return parsed?.[nodeId]?.locked === true;
}

/** Dependencies of {@link commitAnnotationUpdate}. */
export interface AnnotationCommitDeps {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of an annotation commit attempt. */
export interface AnnotationCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/** Commit one rename or lock as ONE history entry. */
export function commitAnnotationUpdate(
	deps: AnnotationCommitDeps,
	edit: AnnotationEdit,
): AnnotationCommitResult {
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const result = updateAnnotationsInData({ data: current, edit });
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
				: updateAnnotationsInData({ data: previous, edit }).data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return { status: "committed", errors: [] };
}
