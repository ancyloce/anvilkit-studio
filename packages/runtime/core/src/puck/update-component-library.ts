/**
 * @file Component-library writes over the same `setData` path
 * (PLAN-0026 §3.4, §3.8.1; DD-0019 `ED-FA-002`, §14.6). Pure and
 * React-free.
 *
 * **Why this exists before the deletion.** PLAN-0026 §3.8.6 `D-FA-3`
 * names the inverted risk: the danger is not that this replacement is
 * late, it is that the sidecar implementation is deleted on schedule
 * while the replacement slips. Building it first makes `p3-009`'s
 * deletion contingent on working code — so the sidecar
 * `editor/components/*` files are deliberately still present and
 * untouched at the end of this task.
 *
 * The protocol is the one already proven for node appearance
 * (`update-appearance.ts`) and the design system
 * (`update-design-system.ts`), because document-level render state
 * lives in declared root props (contract rule 2):
 *
 * - validate against the declared contract FIRST, then write;
 * - one user intent → ONE history-recording functional-updater
 *   `setData`;
 * - no dispatch on a no-op or a rejection;
 * - never `replaceRoot`;
 * - an existing library that fails validation is **refused, not
 *   overwritten** — destroying data a human may still want is worse
 *   than rejecting the edit.
 *
 * **Concurrency: no `expectedRevision`.** Report 0021 §4.4 showed
 * optimistic concurrency is already inert on carrier documents, and
 * PLAN-0026 §3.4 makes the functional-updater re-derivation the
 * concurrency model: if Puck hands the updater a `previous` that is
 * not the state we validated against, the edit is recomputed against
 * `previous` rather than clobbering it. A revision counter is not
 * reintroduced.
 *
 * **One storage location.** Every write lands in
 * `root.props.componentLibrary`. There is no `__anvilkit` write, no
 * companion map, and no id registry living anywhere else.
 */

import type {
	ComponentDefinition,
	ComponentDefinitionDeletePolicy,
	DocumentComponentLibrary,
	EditorError,
} from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { readDocument } from "../document-model/index.js";
import { materializeInstance } from "../document-model/materialize.js";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import { parseComponentLibrary } from "./read-appearance.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";
import { dispatchOneIntent, failureStatus } from "./commit-protocol.js";

/** Referencing node ids carried on a diagnostic, capped (§14.6). */
const INSTANCE_ID_REPORT_CAP = 50;

/** One component-library intent. */
export type ComponentLibraryEdit =
	| {
			readonly kind: "create";
			/** Caller-generated id — never derived here (§14.2). */
			readonly definition: ComponentDefinition;
	  }
	| {
			readonly kind: "update";
			readonly definitionId: string;
			/** Pure edit over the current definition. */
			readonly update: (current: ComponentDefinition) => ComponentDefinition;
	  }
	| {
			readonly kind: "delete";
			readonly definitionId: string;
			readonly policy: ComponentDefinitionDeletePolicy;
	  };

/** Input to {@link updateComponentLibraryInData}. */
export interface UpdateComponentLibraryInput {
	readonly data: Data;
	/** Needed to count live instances through official traversal. */
	readonly config: Config;
	readonly edit: ComponentLibraryEdit;
}

/** Outcome of the pure update. */
export interface UpdateComponentLibraryResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/** Live instances of one definition, document-wide. */
export interface DefinitionInstanceUsage {
	readonly count: number;
	readonly instanceNodeIds: readonly string[];
}

function rawLibraryOf(data: Data): unknown {
	return (data.root?.props as { componentLibrary?: unknown } | undefined)
		?.componentLibrary;
}

/**
 * Produce the next document with `root.props.componentLibrary` replaced.
 *
 * Exported for `p3-002`'s variant writes, which must land a definition
 * edit and the instance selections it resolves in ONE `Data` — and
 * therefore one history entry.
 */
export function withComponentLibrary(
	data: Data,
	next: DocumentComponentLibrary | undefined,
): Data {
	const root = (data.root ?? {}) as { props?: Record<string, unknown> };
	const { componentLibrary: _dropped, ...restProps } = root.props ?? {};
	return {
		...data,
		root: {
			...root,
			props:
				next === undefined
					? restProps
					: { ...restProps, componentLibrary: next },
		},
	} as Data;
}

/**
 * Count instances referencing `definitionId`.
 *
 * Named distinctly from the sidecar's `countLiveInstances`
 * (`editor/components/lifecycle.ts:51`) on purpose: both are exported
 * from `@anvilkit/core/editor` until `p3-009` deletes the sidecar, and
 * two same-named counters over different data sources is exactly the
 * ambiguity this program exists to remove.
 *
 * Re-signatured onto the carrier by `p3-001` — the sidecar version
 * walked `state.nodes`; this
 * reads the declared component-instance prop through the canonical
 * read model, so it sees the same tree the compiler and the inspector
 * see. The 50-id report cap is preserved verbatim.
 */
export function countDefinitionInstances(
	data: Data,
	config: Config,
	definitionId: string,
): DefinitionInstanceUsage {
	const model = readDocument(data, config);
	const instanceNodeIds: string[] = [];
	let count = 0;
	for (const [nodeId, node] of model.nodes) {
		if (node.componentInstance?.definitionId !== definitionId) continue;
		count += 1;
		if (instanceNodeIds.length < INSTANCE_ID_REPORT_CAP) {
			instanceNodeIds.push(nodeId);
		}
	}
	return { count, instanceNodeIds };
}

/**
 * Reject a definition that would contain an instance of itself.
 *
 * Detection reuses `materializeInstance` rather than re-deriving
 * reachability: it already walks nested instance links depth-first
 * with the §24.4 depth cap and returns the **full loop path**
 * (`Card → Badge → Card`). Running it against a synthetic instance of
 * the candidate definition asks exactly the write-time question —
 * "would materializing this loop?" — using the same code the read
 * model answers it with, so the two cannot disagree.
 *
 * This runs BEFORE `setData`, never after.
 */
function rejectCycle(
	definitions: Readonly<Record<string, ComponentDefinition>>,
	definitionId: string,
): EditorError | undefined {
	const probe = materializeInstance(
		`__cycle-probe:${definitionId}`,
		{
			definitionId,
			definitionRevision: 0,
			variantSelection: {},
			propOverrides: {},
			nodeOverrides: {},
		},
		definitions,
	);
	if (probe.status === "cycle") {
		return makeEditorError(
			"EDITOR_COMPONENT_CYCLE",
			`component definition "${definitionId}" would contain an instance of itself`,
			{
				details: {
					kind: "componentDefinition",
					definitionId,
					path: [...probe.path],
				},
			},
		);
	}
	if (probe.status === "depth-exceeded") {
		return makeEditorError(
			"EDITOR_LIMIT_EXCEEDED",
			`component definition "${definitionId}" nests too deeply`,
			{
				details: {
					kind: "componentDefinition",
					reason: "componentNestingDepth",
					definitionId,
					path: [...probe.path],
				},
			},
		);
	}
	return undefined;
}

/**
 * Validate a delete under the DD-0019 §14.6 host policy.
 *
 * Ported verbatim in behaviour from `editor/components/lifecycle.ts:78`:
 * an unknown definition is `EDITOR_DEFINITION_UNAVAILABLE`; a
 * definition with live instances is `EDITOR_DEFINITION_REFERENCED`
 * carrying the referencing node ids. Instances themselves are **never
 * dropped** — deletion removes the definition only, so the
 * `ED-COMP-007` retention guarantee survives and the orphaned
 * instances stay diagnosable data (`p2-004`'s projection reports them
 * as `missing-definition`) rather than disappearing silently.
 */
function validateDelete(
	definitions: Readonly<Record<string, ComponentDefinition>>,
	usage: DefinitionInstanceUsage,
	definitionId: string,
	policy: ComponentDefinitionDeletePolicy,
): readonly EditorError[] {
	if (definitions[definitionId] === undefined) {
		return [
			makeEditorError(
				"EDITOR_DEFINITION_UNAVAILABLE",
				`component definition "${definitionId}" is not in this document`,
				{ details: { kind: "componentDefinition", definitionId } },
			),
		];
	}
	if (usage.count === 0) return [];
	return [
		makeEditorError(
			"EDITOR_DEFINITION_REFERENCED",
			`component definition "${definitionId}" still has ${usage.count} live instance(s)`,
			{
				nodeIds: usage.instanceNodeIds,
				details: {
					kind: "componentDefinition",
					definitionId,
					policy,
					instanceCount: usage.count,
					instanceNodeIds: usage.instanceNodeIds,
				},
			},
		),
	];
}

/**
 * The pure library update: parse, edit, validate, compare.
 *
 * Mirrors `updateDesignSystemInData` step for step, including the
 * refusal to overwrite an existing library that fails validation.
 */
export function updateComponentLibraryInData(
	input: UpdateComponentLibraryInput,
): UpdateComponentLibraryResult {
	const errors: EditorError[] = [];
	const reject = (): UpdateComponentLibraryResult => ({
		data: input.data,
		status: "rejected",
		errors,
	});

	const raw = rawLibraryOf(input.data);
	let current: DocumentComponentLibrary | undefined;
	if (raw !== undefined) {
		current = parseComponentLibrary(raw);
		if (current === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
					"root.props.componentLibrary fails validation; refusing to overwrite it",
				),
			);
			return reject();
		}
	}

	const definitions: Record<string, ComponentDefinition> = {
		...(current?.definitions ?? {}),
	};
	const { edit } = input;

	if (edit.kind === "create") {
		const { definition } = edit;
		if (definitions[definition.id] !== undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`component definition "${definition.id}" already exists`,
					{
						details: {
							kind: "componentDefinition",
							definitionId: definition.id,
						},
					},
				),
			);
			return reject();
		}
		definitions[definition.id] = definition;
		const cycle = rejectCycle(definitions, definition.id);
		if (cycle !== undefined) {
			errors.push(cycle);
			return reject();
		}
	} else if (edit.kind === "update") {
		const existing = definitions[edit.definitionId];
		if (existing === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_DEFINITION_UNAVAILABLE",
					`component definition "${edit.definitionId}" is not in this document`,
					{
						details: {
							kind: "componentDefinition",
							definitionId: edit.definitionId,
						},
					},
				),
			);
			return reject();
		}
		definitions[edit.definitionId] = edit.update(existing);
		const cycle = rejectCycle(definitions, edit.definitionId);
		if (cycle !== undefined) {
			errors.push(cycle);
			return reject();
		}
	} else {
		const usage = countDefinitionInstances(
			input.data,
			input.config,
			edit.definitionId,
		);
		const problems = validateDelete(
			definitions,
			usage,
			edit.definitionId,
			edit.policy,
		);
		if (problems.length > 0) {
			errors.push(...problems);
			return reject();
		}
		delete definitions[edit.definitionId];
	}

	const next: DocumentComponentLibrary | undefined =
		Object.keys(definitions).length === 0 ? undefined : { definitions };

	// Validate the whole library before anything writes.
	if (next !== undefined && parseComponentLibrary(next) === undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				"the updated component library fails schema validation",
				{ details: { kind: "componentDefinition" } },
			),
		);
		return reject();
	}

	if (deepEqualJson(raw, next)) {
		return { data: input.data, status: "noop", errors: [] };
	}
	return {
		data: withComponentLibrary(input.data, next),
		status: "updated",
		errors: [],
	};
}

/** Dependencies of {@link commitComponentLibraryUpdate}. */
export interface ComponentLibraryCommitDeps extends WriterGateDep {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a commit attempt. */
export interface ComponentLibraryCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/**
 * Commit one component-library intent through ONE history-recording
 * functional-updater `setData` dispatch, so a create, an update or a
 * delete is exactly one undo step.
 */
export function commitComponentLibraryUpdate(
	deps: ComponentLibraryCommitDeps,
	edit: ComponentLibraryEdit,
): ComponentLibraryCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", errors: [gate] };
	}
	const api = deps.getPuckApi();
	const config = api.config as Config;
	const attempt = dispatchOneIntent<UpdateComponentLibraryResult>(api, (data) =>
		updateComponentLibraryInData({ data, config, edit }),
	);
	if (!attempt.committed) {
		return {
			status: failureStatus(attempt.outcome),
			errors: attempt.outcome.errors,
		};
	}
	return { status: "committed", errors: [] };
}
