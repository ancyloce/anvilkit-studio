"use client";

/**
 * @file The canvas rich-text surface (PLAN-0020 CORE-P1B-009E;
 * ED-TEXT-001 rich targets; DD-DEC-012).
 *
 * Mounts a Tiptap editor over the target element (overlay-positioned
 * at the node rect) whenever the inline controller holds a
 * `format: "tiptap"` session. Everything schema-related comes from
 * the shared `tiptap-contract` module — the SAME extension set the
 * `RichTextField` mounts — and every commit passes
 * `sanitizeTiptapDocument`, so canvas output is structurally
 * identical to field output for the same input.
 *
 * The Tiptap bundle loads lazily through `RichTextSurfaceMount`
 * (bundle rule: no Tiptap bytes until a rich session actually
 * starts). Iframe styling rides an inline minimal style block —
 * canvas-iframe styles do not inherit parent CSS (repo rule).
 * Browser-matrix certification of the full IME/paste/undo chain in
 * this surface belongs to CORE-P1B-012.
 */

import type { TiptapDocumentV1 } from "@anvilkit/contracts/editor";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import type { StudioEditorBridge } from "../bridge.js";
import { useOverlayPortalRegistration } from "../canvas/overlay-root.js";
import { INLINE_PASTE_LIMIT_BYTES } from "./controller.js";
import {
	createTiptapExtensions,
	emptyTiptapDocument,
	sanitizeTiptapDocument,
	tiptapFromPlainText,
} from "./tiptap-contract.js";

/** Props for the rich surface. */
export interface RichTextSurfaceProps {
	readonly bridge: StudioEditorBridge;
}

/**
 * Seed the editing session's initial document. Phase 1B seeds from
 * the rendered text (a total, host-independent contract); reading a
 * `TiptapDocumentV1` prop verbatim joins the Phase 3 binding pass.
 */
function currentValue(
	bridge: StudioEditorBridge,
	nodeId: string,
): TiptapDocumentV1 {
	const element = bridge.canvasRegistry?.getPrimaryElement(nodeId) ?? null;
	if (element === null) {
		return emptyTiptapDocument();
	}
	return tiptapFromPlainText(element.textContent ?? "");
}

/** The mounted rich editor for the active tiptap session. */
export default function RichTextSurface({
	bridge,
}: RichTextSurfaceProps): ReactNode {
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const session = bridge.inline?.getSession() ?? null;
	const active =
		session !== null && session.target.format === "tiptap" ? session : null;

	const hostRef = useRef<HTMLDivElement | null>(null);
	useOverlayPortalRegistration(
		hostRef,
		useMemo(() => ({ disableDrag: true }), []),
	);

	const initial = useMemo(
		() =>
			active === null
				? emptyTiptapDocument()
				: currentValue(bridge, active.nodeId),
		[bridge, active],
	);

	const editor = useEditor(
		{
			extensions: createTiptapExtensions() as never,
			content:
				active === null
					? ""
					: ({
							type: "doc",
							content: initial.content as unknown as JSONContent[],
						} satisfies JSONContent),
			immediatelyRender: false,
			autofocus: true,
		},
		[active?.nodeId, active?.target.id],
	);

	// Escape cancels; blur commits — both through the controller so
	// the single-session rules hold. Composition is fenced exactly like
	// the plain surface (009F): a blur that lands mid-composition
	// defers its commit to `compositionend`. Oversized pastes are
	// blocked before Tiptap parses them (009G) — allowed content still
	// re-sanitizes through the shared contract on commit.
	useEffect(() => {
		if (editor === null || active === null) {
			return;
		}
		const dom = editor.view.dom;
		let composing = false;
		let pendingBlurCommit = false;
		const commit = (): void => {
			bridge.inline?.commitValue(sanitizeTiptapDocument(editor.getJSON()));
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			event.stopPropagation();
			if (event.key === "Escape") {
				event.preventDefault();
				bridge.inline?.cancel();
			}
		};
		const onBlur = (): void => {
			if (composing) {
				pendingBlurCommit = true;
				return;
			}
			commit();
		};
		const onCompositionStart = (): void => {
			composing = true;
		};
		const onCompositionEnd = (): void => {
			composing = false;
			if (pendingBlurCommit) {
				pendingBlurCommit = false;
				commit();
			}
		};
		const onPaste = (event: ClipboardEvent): void => {
			const clipboard = event.clipboardData;
			if (clipboard === null) {
				return;
			}
			const size =
				clipboard.getData("text/html").length +
				clipboard.getData("text/plain").length;
			if (size > INLINE_PASTE_LIMIT_BYTES) {
				event.preventDefault();
				event.stopPropagation();
				bridge.diagnostics.setDiagnostics("inline-paste", [
					{
						code: "EDITOR_LIMIT_EXCEEDED",
						severity: "warning",
						message: "pasted content exceeds the 1 MiB inline limit",
						recoverable: true,
						details: {
							limitKey: "inlinePasteBytes",
							limit: INLINE_PASTE_LIMIT_BYTES,
							actual: size,
						},
					},
				]);
			}
		};
		dom.addEventListener("keydown", onKeyDown);
		dom.addEventListener("blur", onBlur);
		dom.addEventListener("compositionstart", onCompositionStart);
		dom.addEventListener("compositionend", onCompositionEnd);
		dom.addEventListener("paste", onPaste, true);
		return () => {
			dom.removeEventListener("keydown", onKeyDown);
			dom.removeEventListener("blur", onBlur);
			dom.removeEventListener("compositionstart", onCompositionStart);
			dom.removeEventListener("compositionend", onCompositionEnd);
			dom.removeEventListener("paste", onPaste, true);
		};
	}, [editor, active, bridge]);

	if (active === null || editor === null) {
		return null;
	}
	const element =
		bridge.canvasRegistry?.getPrimaryElement(active.nodeId) ?? null;
	if (element === null) {
		return null;
	}
	const rect = element.getBoundingClientRect();
	const view = element.ownerDocument.defaultView;

	return (
		<div
			ref={hostRef}
			data-ak-rich-surface={active.nodeId}
			style={{
				position: "absolute",
				left: `${rect.left + (view?.scrollX ?? 0)}px`,
				top: `${rect.top + (view?.scrollY ?? 0)}px`,
				minWidth: `${Math.max(rect.width, 80)}px`,
				minHeight: `${Math.max(rect.height, 24)}px`,
				background: "var(--editor-panel, #fff)",
				border: "1px solid var(--editor-selection, #3b82f6)",
				borderRadius: "2px",
				padding: "2px 4px",
				pointerEvents: "auto",
				zIndex: 1,
			}}
		>
			<EditorContent editor={editor} />
		</div>
	);
}
