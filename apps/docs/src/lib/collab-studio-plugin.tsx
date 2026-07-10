"use client";

/**
 * Presence broadcaster for the docs playground's collab demo.
 *
 * Ported from `apps/studio/lib/collab-studio-plugin.tsx`. Owns ALL
 * outbound presence writes (cursor + Puck selection) through the
 * adapter's awareness channel, mounted via Puck's `puck` override slot
 * so `createUsePuck()` resolves inside `<Puck>`, and reading the
 * adapter from `<CollabUIProvider>` context (provided by the
 * consolidated `createCollabPlugin()` factory from `@anvilkit/collab-ui`).
 *
 * Register this plugin AFTER `createCollabPlugin()` in the plugins array
 * so its overrides compose on top of the consolidated plugin's
 * providers.
 */

import { useCollabAdapter, useCollabSelf } from "@anvilkit/collab-ui";
import type { StudioPlugin } from "@anvilkit/core/types";
import {
	createUsePuck,
	type ComponentData as PuckComponentData,
} from "@puckeditor/core";
import { type ReactElement, type ReactNode, useEffect, useMemo } from "react";

const META = {
	id: "anvilkit-docs-collab-studio-presence",
	name: "Collab Presence Broadcaster",
	version: "0.2.0",
	coreVersion: "^0.1.0-alpha",
	description:
		"Broadcasts the local cursor + Puck selection through the collab adapter's awareness channel.",
} as const;

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

function PresenceWriter(): null {
	const adapter = useCollabAdapter();
	const self = useCollabSelf();
	const selectedNodeId = useStudioPuck(selectSelection);
	const selection = useMemo(
		() =>
			selectedNodeId === null ? null : ({ nodeIds: [selectedNodeId] } as const),
		[selectedNodeId],
	);

	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	useEffect(() => {
		if (!adapter.presence || !self) return;
		adapter.presence.update({
			peer: self,
			cursor: cursorRef.current ?? undefined,
			selection: selection ?? undefined,
		});
	}, [adapter, self, selection]);

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

/**
 * Studio plugin contributing the presence writer via `overrides.puck`.
 * Takes no options — reads the adapter and local peer from
 * `<CollabUIProvider>` context.
 */
export function createCollabStudioPlugin(): StudioPlugin {
	function PuckOverride({ children }: { children: ReactNode }): ReactElement {
		return (
			<>
				<PresenceWriter />
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
