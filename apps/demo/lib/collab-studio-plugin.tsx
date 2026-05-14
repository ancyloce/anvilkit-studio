"use client";

import { useCollabSelf } from "@anvilkit/collab-ui";
import type { StudioPlugin } from "@anvilkit/core/types";
import type { YjsSnapshotAdapter } from "@anvilkit/plugin-collab-yjs";
import {
	createUsePuck,
	type ComponentData as PuckComponentData,
} from "@puckeditor/core";
import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useMemo,
} from "react";

export interface CreateCollabStudioPluginOptions {
	readonly adapter: YjsSnapshotAdapter;
}

const META = {
	id: "demo-collab-studio-presence",
	name: "Collab Presence Broadcaster",
	version: "0.1.0",
	coreVersion: "^0.1.0-alpha",
	description:
		"Broadcasts the local cursor + Puck selection through the collab adapter's awareness channel. Mounted via Puck's `puck` override slot so `usePuckSelection()` (which calls `createUsePuck()` internally) has the surrounding `<Puck>` provider available.",
} as const;

/**
 * Studio plugin that owns ALL outbound presence writes for the demo.
 *
 * Background: `@anvilkit/plugin-collab-yjs`'s `usePuckSelection()` calls
 * `createUsePuck()` under the hood, so it MUST run inside `<Puck>`. The
 * AnvilKit chrome mounts `<StudioLayout>` from the `puck` override slot,
 * and `mergeOverrides()` composes per-key wrappers — this plugin's
 * `overrides.puck` therefore receives `<StudioLayout/>` as `children`
 * and gets to mount auxiliary content inside Puck without replacing the
 * chrome.
 *
 * Why one writer: Yjs awareness replaces local state per call (see
 * `packages/ui/src/presence/use-presence.ts:75-76`). If two callers
 * each pass a partial frame (one with `cursor`, one with `selection`),
 * they erase each other's fields. Routing cursor and selection through
 * a single component keeps both fields in lock-step every write.
 */
// Local replacement for `@anvilkit/plugin-collab-yjs`'s
// `usePuckSelection()`. The plugin is published as a submodule that
// pulls in its own copy of `@puckeditor/core` as a peer dep, and pnpm
// in this workspace currently keeps both 0.21.1 (the plugin's
// resolved version) AND 0.21.2 (the demo's) in the store. Two
// `@puckeditor/core` copies means two `UsePuckStoreContext` objects:
// the plugin's `createUsePuck()` hook reads context A while
// `<Puck>` (used by `<Studio>`) provides context B, so the hook
// throws `usePuck must be used inside <Puck>` at runtime even though
// it is structurally inside the Puck tree. Inlining the bridge here
// guarantees `createUsePuck` and `<Puck>` come from the same module
// instance.
const useStudioPuck = createUsePuck();
const PUCK_PREVIEW_FRAME_SELECTOR = "iframe#preview-frame";

interface PuckSelectionState {
	readonly selectedItem: PuckComponentData | null;
}

interface CursorCoords {
	readonly x: number;
	readonly y: number;
}

interface PresenceSelection {
	readonly nodeIds: readonly string[];
}

function selectSelection(state: PuckSelectionState): string | null {
	const item = state.selectedItem;
	if (item === null) return null;
	const props = item.props as { readonly id?: unknown };
	if (typeof props.id !== "string") return null;
	return props.id;
}

export function createCollabStudioPlugin(
	options: CreateCollabStudioPluginOptions,
): StudioPlugin {
	const { adapter } = options;

	function PresenceBroadcaster(): null {
		const self = useCollabSelf();
		const selectedNodeId = useStudioPuck(selectSelection);
		const selection = useMemo(
			() =>
				selectedNodeId === null
					? null
					: ({ nodeIds: [selectedNodeId] } as const),
			[selectedNodeId],
		);
		useEffect(() => {
			selectionRef.current = selection;
		}, [selection]);

		// Selection-triggered write: re-broadcasts with the latest known
		// cursor position so the remote ring tracks selection changes
		// even between mouse moves.
		useEffect(() => {
			if (!adapter.presence || !self) return;
			adapter.presence.update({
				peer: self,
				cursor: cursorRef.current ?? undefined,
				selection: selection ?? undefined,
			});
		}, [self, selection]);

		return null;
	}

	function PuckOverride({ children }: { children: ReactNode }): ReactElement {
		return (
			<>
				<PresenceBroadcaster />
				{children}
			</>
		);
	}

	return {
		meta: META,
		register() {
			return {
				meta: META,
				overrides: {
					puck: PuckOverride,
				},
			};
		},
	};
}

export function CollabCursorBroadcaster({
	adapter,
}: CreateCollabStudioPluginOptions): null {
	const self = useCollabSelf();

	// Cursor-triggered write: listens to both the parent chrome and
	// the Puck preview iframe, then translates iframe-relative mouse
	// coords back into the fixed viewport overlay's coordinate space.
	useEffect(() => {
		if (!adapter.presence || !self) return;
		const presence = adapter.presence;

		const publishCursor = (cursor: CursorCoords) => {
			cursorRef.current = cursor;
			presence.update({
				peer: self,
				cursor,
				selection: selectionRef.current ?? undefined,
			});
		};

		const windowHandler = (event: MouseEvent) => {
			publishCursor({ x: event.clientX, y: event.clientY });
		};

		let frame: HTMLIFrameElement | null = null;
		let frameDocument: Document | null = null;

		const frameHandler = (event: MouseEvent) => {
			if (!frame) return;
			const rect = frame.getBoundingClientRect();
			publishCursor({
				x: rect.left + event.clientX,
				y: rect.top + event.clientY,
			});
		};

		function detachFrameDocument(): void {
			frameDocument?.removeEventListener("mousemove", frameHandler);
			frameDocument = null;
		}

		function detachFrame(): void {
			detachFrameDocument();
			frame?.removeEventListener("load", attachFrame);
			frame = null;
		}

		function attachFrame(): void {
			const nextFrame = getPuckPreviewFrame();
			if (nextFrame !== frame) {
				detachFrame();
				frame = nextFrame;
				frame?.addEventListener("load", attachFrame);
			}

			const nextDocument = nextFrame
				? getAccessibleFrameDocument(nextFrame)
				: null;
			if (nextDocument === frameDocument) return;
			detachFrameDocument();
			frameDocument = nextDocument;
			frameDocument?.addEventListener("mousemove", frameHandler, {
				passive: true,
			});
		}

		const observer = new MutationObserver(attachFrame);
		if (document.body) {
			observer.observe(document.body, { childList: true, subtree: true });
		}
		attachFrame();

		window.addEventListener("mousemove", windowHandler, { passive: true });
		window.addEventListener("focus", attachFrame);
		return () => {
			window.removeEventListener("mousemove", windowHandler);
			window.removeEventListener("focus", attachFrame);
			observer.disconnect();
			detachFrame();
		};
	}, [adapter, self]);

	return null;
}

// Module-level "last known cursor" so a remount of the broadcaster
// after a peer-identity change or a chrome-mode toggle preserves the
// previous cursor coords for the very next selection-triggered write.
// (Local state would be reset on remount.)
const cursorRef: {
	current: CursorCoords | undefined;
} = { current: undefined };

const selectionRef: {
	current: PresenceSelection | null;
} = { current: null };

function getPuckPreviewFrame(): HTMLIFrameElement | null {
	return document.querySelector<HTMLIFrameElement>(PUCK_PREVIEW_FRAME_SELECTOR);
}

function getAccessibleFrameDocument(frame: HTMLIFrameElement): Document | null {
	try {
		return frame.contentDocument;
	} catch {
		return null;
	}
}
