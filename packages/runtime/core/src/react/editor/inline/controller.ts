"use client";

/**
 * @file `InlineEditController` — the canvas inline-text session
 * (PLAN-0028 `p4-007`; PLAN-0026 §3.4/§3.5).
 *
 * **A rebase of the shipped CORE-P1B-009B..H controller, not a
 * rewrite.** The session rules, the plain contenteditable surface, the
 * IME fencing, the paste sanitation and the idle/blur coalescing are
 * the code that shipped; what changed is the two ends it is bolted to.
 *
 * - **Reads** come from `document-model`'s {@link readDocument} — the
 *   same projection of `(appState.data, config)` that `useDocumentModel`
 *   binds for the composition panels. The declared targets are
 *   `DocumentNode.inlineText` (empty means the component declares none)
 *   and the lock is the declared `editorAnnotations` root prop. The
 *   sidecar reads this controller used to make — `capabilities.forNode`
 *   for the declaration, `port.getSnapshot().authoring.nodes[id].locked`
 *   for the lock — are **gone**: neither answers for a carrier document.
 * - **Writes** go through `commitInlineTextUpdate` (`p3-004`) — the same
 *   pure helper `useInlineTextCommit` wraps. One committed edit is one
 *   functional `setData` with `recordHistory: true`, so one edit is one
 *   undo. The old `port.commitNative` path, which carried a sidecar
 *   reconciliation alongside the prop write, is gone with it.
 *
 * ### Why the pure helper and not the `useInlineTextCommit` hook
 *
 * `useInlineTextCommit` is a `useGetPuck` adapter and therefore only
 * usable **inside** `<Puck>`. This controller is built by `EditorRoot`,
 * which `StudioEditorMount` renders as a *sibling* of the `<Puck>`
 * subtree, so no component in this chunk can call a Puck hook at all —
 * every editor-runtime surface reaches the store through the bridge's
 * `getPuckApi()` seam instead (`p3-009`; formerly the command port's
 * `tryGetPuckApi`). The hook and this call site therefore share one
 * implementation and one single-dispatch guarantee; only the binding
 * differs.
 *
 * ### Session rules (unchanged)
 *
 * - exactly ONE active session; a second `enter` exits the first via
 *   commit;
 * - the draft lives in the DOM surface only — never a durable store;
 *   interrupted sessions (Escape, external revision, document
 *   replacement) restore the pre-edit DOM exactly and commit nothing;
 * - canvas gestures, marquee, and drill-in are suppressed while a
 *   session is active (surfaces consult {@link InlineEditController.getSession});
 * - **commit** fires at 750 ms typing idle or on blur — ONE
 *   history-recording dispatch per committed edit; a value-equal draft
 *   commits nothing (the carrier helper's own `deepEqualJson` is the
 *   authority, so a no-op cannot slip into history);
 * - **IME**: commits and idle timers are fenced during composition —
 *   nothing converts drafts to commands between `compositionstart`
 *   and `compositionend`;
 * - **paste** (plain surface): text/plain extraction only (markup can
 *   never smuggle through `textContent`); payloads over 1 MiB are
 *   blocked with a visible diagnostic;
 * - browser-undo works freely IN-SESSION (native contenteditable
 *   history); once committed, undo is Puck history only.
 *
 * ### Puck contract
 *
 * Rule 2: the value lands at the component's **declared** inline-text
 * prop path, validated against that declaration before dispatch. Rule
 * 3: it is the same prop the preview, the production render and the
 * HTML exporter's `richText` capability read — one value, four
 * consumers, no editor-only copy anywhere.
 */

import type {
	InlineTextTarget,
	TiptapDocument,
} from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { readDocument } from "../../../document-model/index.js";
import { commitInlineTextUpdate } from "../../../puck/update-carriers.js";
import type { StudioEditorBridge } from "../bridge.js";
import type {
	InlineEditSession,
	InternalInlineEditController,
} from "./controller-types.js";
import { targetFromElement } from "./targets.js";

export type {
	InlineEditController,
	InlineEditSession,
	InternalInlineEditController,
} from "./controller-types.js";

/** Commit-at-idle window (§17). */
export const INLINE_IDLE_COMMIT_MS = 750;
/** Paste hard cap (§17). */
export const INLINE_PASTE_LIMIT_BYTES = 1024 * 1024;

/** Diagnostic slice for a rejected inline commit (cleared per session). */
const INLINE_COMMIT_DIAGNOSTICS = "inline-commit";
/** Diagnostic slice for an oversized paste (cleared per session). */
const INLINE_PASTE_DIAGNOSTICS = "inline-paste";

const NO_PROPS: Record<string, unknown> = Object.freeze({});

/** Plain-target normalization (§17): newline + whitespace cleanup. */
export function normalizePlainText(raw: string): string {
	return raw
		.replace(/ /g, " ")
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.replace(/\n+$/g, "");
}

/** The live `PuckApi`, or `null` when `<Puck>` is not mounted. */
function puckApiOf(bridge: StudioEditorBridge): PuckApi | null {
	return bridge.getPuckApi();
}

/**
 * One node's raw props from the live tree.
 *
 * Traversal is official `walkTree` — the *identical* traversal
 * `updateInlineTextInData` runs to locate the same node — so the value
 * read here and the value written there can never be addressed
 * differently. A hand-rolled walk over `data.content` would miss slots
 * and legacy zones, which `document-model/read-document.ts` calls out
 * as precisely the bug class the Puck contract exists to prevent.
 */
function nodePropsOf(
	data: Data,
	config: Config,
	nodeId: string,
): Record<string, unknown> {
	let found: Record<string, unknown> = NO_PROPS;
	walkTree(data, config, (content) => {
		for (const item of content) {
			const props = item.props as Record<string, unknown>;
			if (props.id === nodeId) {
				found = props;
			}
		}
		return content;
	});
	return found;
}

/** Everything the inline layer needs to know about one node. */
interface InlineNodeRead {
	/** Declared inline-text targets; empty means "declares none". */
	readonly targets: readonly InlineTextTarget[];
	/** From the declared `editorAnnotations` root prop, never a sidecar. */
	readonly locked: boolean;
	/** The node's raw props, for reading a declared target's value. */
	readonly props: Record<string, unknown>;
}

function readInlineNode(
	bridge: StudioEditorBridge,
	nodeId: string,
): InlineNodeRead | null {
	const api = puckApiOf(bridge);
	if (api === null) {
		return null;
	}
	const data = api.appState.data as Data;
	const config = api.config as Config;
	// `readDocument` is memoized on `(config, data)` identity, so an
	// entry probe costs a `WeakMap` hit once the model has been projected
	// for the current document — which the inspector has already done.
	const model = readDocument(data, config);
	const node = model.nodes.get(nodeId);
	if (node === undefined) {
		return null;
	}
	return {
		targets: node.inlineText,
		locked: model.annotations[nodeId]?.locked === true,
		props: nodePropsOf(data, config, nodeId),
	};
}

/**
 * The current value stored at a node's declared inline-text prop, or
 * `undefined` when nothing has been authored there.
 *
 * The rich surface seeds its editing session from this so a `tiptap`
 * document round-trips edit → save → reload with its structure intact;
 * seeding from rendered `textContent` (what shipped) flattened every
 * document to a paragraph list on the first edit.
 */
export function readInlineTextValue(
	bridge: StudioEditorBridge,
	nodeId: string,
	propPath: string,
): unknown {
	return readInlineNode(bridge, nodeId)?.props[propPath];
}

/** Create the per-`<Studio>` inline edit controller. */
export function createInlineEditController(
	bridge: StudioEditorBridge,
): InternalInlineEditController {
	const listeners = new Set<() => void>();
	let session: InlineEditSession | null = null;
	/** The `Data` identity the session opened against (foreign-change token). */
	let sessionDocument: unknown = null;
	let composing = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let element: HTMLElement | null = null;
	let originalText = "";
	let originalEditable = "";
	let detachSurface: (() => void) | null = null;
	let pendingBlurCommit = false;
	let committing = false;

	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
		bridge.notify();
	};

	const clearIdle = (): void => {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	};

	const scheduleIdleCommit = (): void => {
		clearIdle();
		if (composing) {
			return; // never convert drafts during composition (009F)
		}
		idleTimer = setTimeout(() => {
			controller.commit();
		}, INLINE_IDLE_COMMIT_MS);
	};

	const teardown = (): void => {
		clearIdle();
		detachSurface?.();
		detachSurface = null;
		if (element !== null) {
			element.contentEditable = originalEditable;
		}
		element = null;
		session = null;
		composing = false;
		pendingBlurCommit = false;
		bridge.diagnostics.setDiagnostics(INLINE_PASTE_DIAGNOSTICS, []);
		bridge.diagnostics.setDiagnostics(INLINE_COMMIT_DIAGNOSTICS, []);
		notify();
	};

	/**
	 * Commit one authored value as ONE history entry.
	 *
	 * The declaration check, the `plain` / `tiptap` format check and the
	 * value-equality check all live in `updateInlineTextInData`, before
	 * any dispatch — so a rejected commit leaves the document untouched
	 * and surfaces as a diagnostic rather than as a silent no-op that
	 * reads as success.
	 */
	const commitInline = (value: string | TiptapDocument): void => {
		const active = session;
		const api = puckApiOf(bridge);
		if (active === null || api === null) {
			return;
		}
		committing = true;
		try {
			// `api` is the live store handle, read once and used
			// immediately: the helper calls this thunk and reads
			// `appState.data` synchronously on the next line.
			const result = commitInlineTextUpdate(
				{ getPuckApi: () => api },
				{
					nodeId: active.nodeId,
					targetId: active.target.id,
					value,
				},
			);
			bridge.diagnostics.setDiagnostics(
				INLINE_COMMIT_DIAGNOSTICS,
				result.status === "rejected" ? result.errors : [],
			);
		} finally {
			committing = false;
		}
	};

	const bindPlainSurface = (host: HTMLElement): void => {
		element = host;
		originalText = host.textContent ?? "";
		originalEditable = host.contentEditable;
		host.contentEditable = "true";
		try {
			host.focus();
		} catch {
			// Non-focusable in this environment: editing still works.
		}

		const onInput = (): void => {
			scheduleIdleCommit();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			// Belt-and-braces for listeners bound inside the canvas document.
			// The canonical suppression seam for editor shortcuts is
			// `isInlineEditingFocused` in `./focus.ts` — a keydown in the
			// canvas iframe never reaches a listener on the host document,
			// so propagation alone cannot be the whole answer.
			event.stopPropagation();
			if (event.key === "Escape") {
				event.preventDefault();
				controller.cancel();
			}
		};
		const onBlur = (): void => {
			if (composing) {
				pendingBlurCommit = true;
				return;
			}
			controller.commit();
		};
		const onCompositionStart = (): void => {
			composing = true;
			clearIdle();
		};
		const onCompositionEnd = (): void => {
			composing = false;
			if (pendingBlurCommit) {
				pendingBlurCommit = false;
				controller.commit();
				return;
			}
			scheduleIdleCommit();
		};
		const onPaste = (event: Event): void => {
			const clipboard = (event as ClipboardEvent).clipboardData;
			if (clipboard === null || clipboard === undefined) {
				return;
			}
			event.preventDefault(); // never let HTML through (009G)
			const text = clipboard.getData("text/plain");
			if (text.length > INLINE_PASTE_LIMIT_BYTES) {
				bridge.diagnostics.setDiagnostics(INLINE_PASTE_DIAGNOSTICS, [
					{
						code: "EDITOR_LIMIT_EXCEEDED",
						severity: "warning",
						message: "pasted content exceeds the 1 MiB inline limit",
						recoverable: true,
						details: {
							limitKey: "inlinePasteBytes",
							limit: INLINE_PASTE_LIMIT_BYTES,
							actual: text.length,
						},
					},
				]);
				return;
			}
			const doc = host.ownerDocument;
			const inserted = ((): boolean => {
				try {
					return doc.execCommand("insertText", false, text);
				} catch {
					return false;
				}
			})();
			if (!inserted) {
				host.textContent = `${host.textContent ?? ""}${text}`;
			}
			scheduleIdleCommit();
		};

		host.addEventListener("input", onInput);
		host.addEventListener("keydown", onKeyDown);
		host.addEventListener("blur", onBlur);
		host.addEventListener("compositionstart", onCompositionStart);
		host.addEventListener("compositionend", onCompositionEnd);
		host.addEventListener("paste", onPaste);
		detachSurface = () => {
			host.removeEventListener("input", onInput);
			host.removeEventListener("keydown", onKeyDown);
			host.removeEventListener("blur", onBlur);
			host.removeEventListener("compositionstart", onCompositionStart);
			host.removeEventListener("compositionend", onCompositionEnd);
			host.removeEventListener("paste", onPaste);
		};
	};

	const controller: InternalInlineEditController = {
		getSession: () => session,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		tryEnterFromEvent(target) {
			const registry = bridge.canvasRegistry;
			if (
				registry === null ||
				registry === undefined ||
				bridge.getWriterGateError() !== null
			) {
				return false;
			}
			const nodeId = registry.getNodeId(target);
			if (nodeId === null) {
				return false;
			}
			const read = readInlineNode(bridge, nodeId);
			// A component that declares no inline-text target offers NO
			// inline affordance — double-click falls through to drill-in
			// exactly as it does on a non-text component.
			if (read === null || read.targets.length === 0) {
				return false;
			}
			// Locked nodes are selectable-not-mutable.
			if (read.locked) {
				return false;
			}
			const resolved = targetFromElement(
				target,
				nodeId,
				read.targets,
				registry,
			);
			if (resolved === null) {
				return false;
			}
			if (session !== null) {
				controller.commit(); // single active session (009B)
			}
			session = { nodeId, target: resolved.target };
			// `p3-009`: the sidecar revision counter is gone. Puck replaces
			// `Data` by identity on every dispatch, so the document object
			// IS the foreign-change token — the same signal
			// `canvas/handles` already uses for gesture invalidation, and a
			// strictly better one: it moves on EVERY write, not only on
			// writes the sidecar engine performed.
			sessionDocument = puckApiOf(bridge)?.appState.data ?? null;
			if (resolved.target.format === "plain") {
				bindPlainSurface(resolved.element);
			}
			// `tiptap` targets: the rich overlay observes the session and
			// mounts the shared-schema editor, seeded from the declared prop.
			notify();
			return true;
		},

		commit() {
			const active = session;
			if (active === null) {
				return;
			}
			if (composing) {
				pendingBlurCommit = true;
				return; // 009F: never commit mid-composition
			}
			if (active.target.format === "plain" && element !== null) {
				const draft = normalizePlainText(element.textContent ?? "");
				// Cheap pre-check so an untouched session does not walk the
				// tree at all; the carrier helper re-checks against the stored
				// value and is the authority on "nothing changed".
				if (draft !== normalizePlainText(originalText)) {
					commitInline(draft);
				}
			}
			teardown();
		},

		commitValue(value) {
			if (session === null) {
				return;
			}
			commitInline(value);
			teardown();
		},

		cancel() {
			if (session === null) {
				return;
			}
			if (element !== null) {
				// Restore the pre-edit surface exactly (009H AC).
				element.textContent = originalText;
			}
			teardown();
		},

		handleExternalInterrupt() {
			// Our own in-flight commit bumps the revision too — never
			// treat it as foreign.
			if (session === null || committing) {
				return;
			}
			const currentDocument = puckApiOf(bridge)?.appState.data ?? null;
			if (currentDocument !== sessionDocument) {
				controller.cancel();
			}
		},
	};
	// Self-armed interrupt: ANY bridge notification (foreign commits,
	// undo/redo invalidations) re-checks the session's revision — no
	// external wiring required.
	bridge.subscribe(() => controller.handleExternalInterrupt());
	return controller;
}
