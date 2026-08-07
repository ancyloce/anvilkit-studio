"use client";

/**
 * @file `createEditorCommandPort` — the React-side adapter that turns
 * the pure engine pipeline into the single mutation entry point over
 * Puck (PLAN-0020 CORE-P1A-001; DD-0019 §10.2–§10.5; DD-DEC-006).
 *
 * ### Commit path
 *
 * `execute()` runs `applyEditorCommand` over the cached parsed
 * authoring state and, when the reduction changed state, performs
 * **exactly one** `dispatch({ type: "replaceRoot", recordHistory: true })`
 * per intent, so every commit is one undoable Puck history entry
 * (single-intent rule, §10.5).
 *
 * P6-01: the sidecar write path is gone — v2 commands translate
 * through the command bridge into ONE functional `setData`, and
 * legacy sidecar documents reject every write.
 *
 * ### Parsed-state cache (the ~119 ms rule)
 *
 * `readAuthoringState`'s full deep-parse costs ~119 ms at the §7.3
 * document limits (Phase 0 benchmark), so the port never re-parses on
 * self-originated commits: it caches the parsed state keyed by the
 * **sidecar value's object identity**. A committed transaction primes
 * the cache with the reducer output before dispatching; the
 * controller-driven `handleDataChange` compares identities and only
 * invalidates (lazy re-parse on next read) when a foreign write —
 * undo/redo, plugin `setData`, host replacement — swapped the sidecar
 * object. Unrelated Puck edits spread-clone `root.props`, which
 * preserves the sidecar member reference, so they cost nothing here.
 *
 * ### Mount-time recanonicalization
 *
 * Hosts replace documents by key-remount (verified convention): a new
 * port instance simply parses whatever sidecar the document carries
 * and adopts its revision — there is no reactive `data` seam.
 */

import type {
	EditorError,
	EditorSelectionState,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommand,
} from "../../editor/legacy/index.js";
import type {
	AuthoringStateV1,
	EditorCommandPort,
	EditorCommandResult,
	EditorCommandSnapshot,
	EditorPreviewResult,
} from "../../editor/legacy/index.js";
import {
	ANVILKIT_AUTHORING_KEY,
} from "../../editor/legacy/index.js";
import type {
	PuckApi,
	Config as PuckConfigType,
	Data as PuckData,
} from "@puckeditor/core";
import {
	type AuthoringReadResult,
	applyEditorCommand,
	makeEditorError,
	readAuthoringState,
	reconcileAuthoringState,
	validateEditorCommand,
	writeAuthoringState,
} from "../../editor/index.js";
import { applyV2Plan, planV2Command } from "../../puck/command-bridge.js";
import { scopeGuardError } from "./components/scope.js";
import { effectiveBreakpoints } from "./responsive/preset.js";

/** The empty page-scope selection (replaced by CORE-P1A-002). */
const EMPTY_SELECTION: EditorSelectionState = {
	selectedIds: [],
	definitionScope: "page",
	mode: "page",
};

/** Dependencies of the port — thunks so tests need no `<Studio>`. */
export interface EditorCommandPortDeps {
	/**
	 * Return the live Puck API (fresh snapshot per call). May throw
	 * before `<Puck>` finishes mounting; the port then falls back to
	 * {@link getData} for reads and rejects writes.
	 */
	readonly getPuckApi: () => PuckApi;
	/** Render-independent data snapshot (the controller's `dataRef`). */
	readonly getData: () => PuckData;
	/** The host's `StudioProps.editor` config. */
	readonly editor: StudioEditorConfig;
	/** Read the live selection (installed by CORE-P1A-002). */
	readonly getSelection?: () => EditorSelectionState;
	/**
	 * When non-null, authoring writers are disabled and `execute`
	 * rejects with the returned error (collab gate, CORE-P1A-013).
	 */
	readonly getWriterGateError?: () => EditorError | null;
	/** Called after any state-visible change (commit, invalidation). */
	readonly onStateChange?: () => void;
	/**
	 * Command lifecycle observers (events, CORE-P1A-004). `durationMs`
	 * is the wall-clock cost of the whole `execute` pipeline (validate
	 * → reduce → write → dispatch), measured inside the port.
	 */
	readonly onCommitted?: (
		command: EditorCommand,
		result: EditorCommandResult,
		meta: { readonly durationMs: number },
	) => void;
	readonly onRejected?: (
		command: EditorCommand,
		result: EditorCommandResult,
	) => void;
}

/**
 * A tier-(a) native mutation (CORE-P1A-016): the builder receives the
 * live data + parsed authoring and returns the next pair — tree
 * change and sidecar reconciliation land in ONE history-recording
 * dispatch. Returning `null` aborts (nothing dispatched).
 */
export type NativeMutationBuilder = (
	data: PuckData,
	authoring: AuthoringStateV1,
) => { readonly data: PuckData; readonly authoring: AuthoringStateV1 } | null;

/** The port plus the internal seams the editor root wires up. */
export interface InternalEditorCommandPort extends EditorCommandPort {
	/**
	 * Fed by the controller on every Puck `onChange`: invalidates the
	 * parsed-state cache when the sidecar object changed under us.
	 */
	readonly handleDataChange: (data: PuckData) => void;
	/** Current read-only classification (invalid/unsupported sidecar). */
	readonly isReadOnly: () => boolean;
	/** Read-side access for resolvers (inspector, CSS emission). */
	readonly readCurrent: () => AuthoringReadResult;
	/** The live Puck data (prop-reading surfaces, e.g. image section). */
	readonly readData: () => PuckData;
	/**
	 * The live `PuckApi`, or `null` when `<Puck>` is not mounted.
	 *
	 * The canonical (`p3-001`+) commit helpers take a `getPuckApi`
	 * dependency, and the surfaces that call them — the inspector's
	 * component section, the capture dialog, the canvas toolbar — are
	 * also rendered **bare**, outside a `<Puck>` provider, by panel
	 * tests and by hosts that compose the chrome themselves. Binding
	 * those call sites with `useGetPuck` would throw during render of a
	 * shared inspector section and take down every surface that renders
	 * the inspector at all, not just component authoring.
	 *
	 * Reusing the port's existing injection avoids adding a second,
	 * parallel way to reach the same store. `null` means "no document
	 * to commit against" and callers must degrade to a refusal, never
	 * to a silent no-op that reads as success.
	 *
	 * Optional because test doubles of this interface predate it and
	 * legitimately do not provide it.
	 */
	readonly tryGetPuckApi?: () => PuckApi | null;
	/** True while the collab gate holds authoring writers closed. */
	readonly writersDisabled: () => boolean;
	/**
	 * Commit a Core-owned native mutation (duplicate/delete —
	 * CORE-P1A-016 tier (a)): one history-recording dispatch carrying
	 * both the tree change and the reconciled sidecar; the revision
	 * bumps by one so held snapshots conflict correctly. Rejected (no
	 * dispatch) in read-only mode or while writers are gated.
	 */
	readonly commitNative: (
		build: NativeMutationBuilder,
	) => "committed" | "noop" | "rejected";
}

function sidecarOf(data: PuckData): unknown {
	return (data.root?.props as Record<string, unknown> | undefined)?.[
		ANVILKIT_AUTHORING_KEY
	];
}

/** Build the per-`<Studio>` command port. */
export function createEditorCommandPort(
	deps: EditorCommandPortDeps,
): InternalEditorCommandPort {
	// Cache key: the sidecar value's object identity within Puck data.
	// `cachedRead === null` is the "nothing parsed yet" marker, so the
	// key can start at `undefined` (also the absent-sidecar identity —
	// which keeps a sidecar-less echo from counting as foreign).
	let cachedRaw: unknown;
	let cachedRead: AuthoringReadResult | null = null;

	const currentData = (): PuckData => {
		try {
			return deps.getPuckApi().appState.data as PuckData;
		} catch {
			return deps.getData();
		}
	};

	const readCached = (data: PuckData): AuthoringReadResult => {
		const raw = sidecarOf(data);
		if (cachedRead !== null && raw === cachedRaw) {
			return cachedRead;
		}
		const read = readAuthoringState(data);
		cachedRaw = raw;
		cachedRead = read;
		return read;
	};

	const readCurrent = (): AuthoringReadResult => readCached(currentData());

	const selection = (): EditorSelectionState =>
		deps.getSelection?.() ?? EMPTY_SELECTION;

	const breakpointsOf = (state: AuthoringStateV1) =>
		effectiveBreakpoints(state, deps.editor);

	// Tighten-only host policy (§12.2/§22.4): a `maxBreakpoints` below
	// the design cap rejects larger sets before reduction.
	const policyError = (command: EditorCommand): EditorError | null => {
		const max = deps.editor.policies?.maxBreakpoints;
		if (max === undefined) {
			return null;
		}
		const members = command.type === "batch" ? command.commands : [command];
		for (const member of members) {
			if (
				member.type === "breakpoints.set" &&
				member.breakpoints.length > max
			) {
				return makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`the host limits documents to ${max} breakpoints`,
					{
						details: {
							limitKey: "maxBreakpoints",
							limit: max,
							actual: member.breakpoints.length,
						},
					},
				);
			}
		}
		return null;
	};

	/**
	 * Definition edits require the matching main-component scope
	 * (freeze §6). Enforced here rather than trusting the affordance
	 * not to render, so plugin/AI-originated commands are covered too.
	 */
	const scopeError = (command: EditorCommand): EditorError | null => {
		const selection = deps.getSelection?.();
		if (selection === undefined) {
			return null;
		}
		return scopeGuardError(selection.definitionScope, command, (member) =>
			member.type === "component.definition.update"
				? member.definitionId
				: member.type === "component.override.promote"
					? readCurrent().state.nodes[member.instanceNodeId]?.componentInstance
							?.definitionId
					: undefined,
		);
	};

	const rejected = (
		revision: number,
		errors: readonly EditorError[],
	): EditorCommandResult => ({
		status: "rejected",
		revision,
		changedNodeIds: [],
		errors,
	});

	const port: InternalEditorCommandPort = {
		getSnapshot(): EditorCommandSnapshot {
			const read = readCurrent();
			return {
				revision: read.state.revision,
				authoring: read.state,
				selection: selection(),
				breakpoints: breakpointsOf(read.state),
			};
		},

		validate(command: EditorCommand): readonly EditorError[] {
			const read = readCurrent();
			if (read.readOnly) {
				return read.errors;
			}
			if (command.expectedRevision !== read.state.revision) {
				return [
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						`expected revision ${command.expectedRevision} but document is at ${read.state.revision}`,
						{
							details: {
								expectedRevision: command.expectedRevision,
								revision: read.state.revision,
							},
						},
					),
				];
			}
			const outOfScope = scopeError(command);
			return outOfScope === null
				? validateEditorCommand(read.state, command)
				: [outOfScope, ...validateEditorCommand(read.state, command)];
		},

		preview(command: EditorCommand): EditorPreviewResult {
			const read = readCurrent();
			if (read.readOnly) {
				return { valid: false, errors: read.errors, changedNodeIds: [] };
			}
			const result = applyEditorCommand(read.state, command);
			return {
				valid: result.status !== "rejected",
				errors: result.errors,
				changedNodeIds: result.changes.changedNodeIds,
			};
		},

		// Async by contract (§10.2) though the commit itself is
		// synchronous: one awaitable turn keeps the signature stable for
		// Phase 3 confirmation flows without changing callers later.
		async execute(command: EditorCommand): Promise<EditorCommandResult> {
			const startedAt = performance.now();
			const data = currentData();
			const read = readCached(data);
			if (read.readOnly) {
				const result = rejected(read.state.revision, read.errors);
				deps.onRejected?.(command, result);
				return result;
			}
			const gateError = deps.getWriterGateError?.() ?? null;
			if (gateError !== null) {
				const result = rejected(read.state.revision, [gateError]);
				deps.onRejected?.(command, result);
				return result;
			}
			const policyViolation = policyError(command) ?? scopeError(command);
			if (policyViolation !== null) {
				const result = rejected(read.state.revision, [policyViolation]);
				deps.onRejected?.(command, result);
				return result;
			}

			let api: PuckApi;
			try {
				api = deps.getPuckApi();
			} catch {
				const result = rejected(read.state.revision, [
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						"the editor is not ready to commit yet (<Puck> has not finished mounting)",
						{ details: { reason: "port-not-ready" } },
					),
				]);
				deps.onRejected?.(command, result);
				return result;
			}

			// P6-00 (PLAN-0025 §11.2): a v2 document NEVER touches the
			// sidecar engine. The bridge translates the command vocabulary
			// onto the §5.1/§5.2 carriers and this port performs the same
			// single history-recording dispatch (§10.5). Commands with no
			// v2 equivalent reject with a typed capability error instead
			// of minting a sidecar into a v2 document.
			// Routing marker: `authoringSchemaVersion` is no longer a
			// DECLARED root prop (`p1-001` removed it from the contract),
			// but it is still written into stored documents by the
			// migration and read here off untyped root props. It survives
			// as a transitional routing marker until `p7-002` strips it
			// from the store; the write path stops needing it when
			// `p3-009` deletes the sidecar engine.
			const rootProps = (data.root?.props ?? {}) as Record<string, unknown>;
			if (
				rootProps[ANVILKIT_AUTHORING_KEY] === undefined &&
				rootProps.authoringSchemaVersion === 2
			) {
				const config = (api as unknown as { config?: PuckConfigType }).config;
				if (config === undefined) {
					const result = rejected(read.state.revision, [
						makeEditorError(
							"EDITOR_COMMAND_CONFLICT",
							"the Puck store exposes no config; the v2 command bridge cannot apply",
						),
					]);
					deps.onRejected?.(command, result);
					return result;
				}
				const plan = planV2Command(command);
				if (plan.kind === "unsupported") {
					const result = rejected(read.state.revision, [
						makeEditorError("EDITOR_CAPABILITY_UNSUPPORTED", plan.reason),
					]);
					deps.onRejected?.(command, result);
					return result;
				}
				const appliedV2 = applyV2Plan(plan, data, config);
				if (appliedV2.errors.length > 0) {
					const result = rejected(
						read.state.revision,
						appliedV2.errors.map((error) =>
							"code" in error && "severity" in error
								? (error as EditorError)
								: makeEditorError("EDITOR_COMMAND_CONFLICT", error.message),
						),
					);
					deps.onRejected?.(command, result);
					return result;
				}
				if (!appliedV2.changed) {
					return {
						status: "noop",
						revision: read.state.revision,
						changedNodeIds: [],
						errors: [],
					};
				}
				api.dispatch({
					type: "setData",
					recordHistory: true,
					data: (previous: PuckData) =>
						previous === data
							? appliedV2.data
							: applyV2Plan(plan, previous, config).data,
				} as unknown as Parameters<PuckApi["dispatch"]>[0]);
				const result: EditorCommandResult = {
					status: "committed",
					revision: read.state.revision,
					changedNodeIds: appliedV2.changedNodeIds,
					errors: [],
				};
				deps.onCommitted?.(command, result, {
					durationMs: performance.now() - startedAt,
				});
				deps.onStateChange?.();
				return result;
			}

			const applied = applyEditorCommand(read.state, command);
			if (applied.status === "rejected") {
				const result = rejected(read.state.revision, applied.errors);
				deps.onRejected?.(command, result);
				return result;
			}
			if (applied.status === "noop") {
				// No dispatch, no history entry, no revision bump (§10.3).
				return {
					status: "noop",
					revision: read.state.revision,
					changedNodeIds: [],
					errors: applied.errors,
				};
			}

			// Lazy GC (CORE-P1A-016 tier (b)): fold divergence left by
			// external mutations (plugin `setData`, host writes) into THIS
			// commit — never a standalone history entry. Same revision: the
			// reconciliation is part of the transaction, not a second one.
			const reconciled = reconcileAuthoringState(applied.state, data);
			const committedState = reconciled.changed
				? reconciled.state
				: applied.state;
			const nextData = writeAuthoringState(data, committedState);
			// Prime the cache BEFORE dispatching so a synchronous
			// `onChange` echo classifies as self-originated (no re-parse).
			cachedRaw = sidecarOf(nextData);
			cachedRead = {
				state: committedState,
				readOnly: false,
				errors: [],
				migrated: false,
			};
			// `replaceRoot` spread-merges `root.props` and leaves `content`
			// untouched — exactly the write `writeAuthoringState` made.
			api.dispatch({
				type: "replaceRoot",
				recordHistory: true,
				root: nextData.root,
			} as unknown as Parameters<PuckApi["dispatch"]>[0]);

			const result: EditorCommandResult = {
				status: "committed",
				revision: committedState.revision,
				changedNodeIds: applied.changes.changedNodeIds,
				errors: applied.errors,
			};
			deps.onCommitted?.(command, result, {
				durationMs: performance.now() - startedAt,
			});
			deps.onStateChange?.();
			return result;
		},

		writersDisabled(): boolean {
			return (deps.getWriterGateError?.() ?? null) !== null;
		},

		commitNative(build): "committed" | "noop" | "rejected" {
			const data = currentData();
			const read = readCached(data);
			if (read.readOnly || (deps.getWriterGateError?.() ?? null) !== null) {
				return "rejected";
			}
			let api: PuckApi;
			try {
				api = deps.getPuckApi();
			} catch {
				return "rejected";
			}
			const built = build(data, read.state);
			if (built === null) {
				return "noop";
			}
			// P6-00 (§11.2): a v2 document NEVER gains a sidecar. The native
			// mutation's tree change dispatches as-is; the builder's
			// authoring output (derived from the empty parsed state) is
			// dropped — render state lives in the §5.1 carriers the tree
			// already carries.
			// Same transitional routing marker as above (`p1-001`).
			const nativeRootProps = (data.root?.props ?? {}) as Record<
				string,
				unknown
			>;
			if (
				nativeRootProps[ANVILKIT_AUTHORING_KEY] === undefined &&
				nativeRootProps.authoringSchemaVersion === 2
			) {
				api.dispatch({
					type: "setData",
					recordHistory: true,
					data: built.data,
				} as unknown as Parameters<PuckApi["dispatch"]>[0]);
				deps.onStateChange?.();
				return "committed";
			}
			// Legacy sidecar document: the pre-P6 reconcile-and-write path.
			const reconciled = reconcileAuthoringState(built.authoring, built.data);
			const nextAuthoring: AuthoringStateV1 = {
				...reconciled.state,
				revision: read.state.revision + 1,
			};
			const nextData = writeAuthoringState(built.data, nextAuthoring);
			cachedRaw = sidecarOf(nextData);
			cachedRead = {
				state: nextAuthoring,
				readOnly: false,
				errors: [],
				migrated: false,
			};
			api.dispatch({
				type: "setData",
				recordHistory: true,
				data: nextData,
			} as unknown as Parameters<PuckApi["dispatch"]>[0]);
			deps.onStateChange?.();
			return "committed";
		},

		handleDataChange(data: PuckData): void {
			const raw = sidecarOf(data);
			if (raw === cachedRaw) {
				return;
			}
			// Foreign write (undo/redo, plugin, host): drop the cache and
			// let the next read re-parse lazily.
			cachedRaw = raw;
			cachedRead = null;
			deps.onStateChange?.();
		},

		isReadOnly(): boolean {
			return readCurrent().readOnly;
		},

		readCurrent,
		readData: currentData,

		tryGetPuckApi(): PuckApi | null {
			try {
				return deps.getPuckApi();
			} catch {
				// Documented on `deps.getPuckApi`: it may throw before
				// `<Puck>` finishes mounting.
				return null;
			}
		},
	};
	return port;
}
