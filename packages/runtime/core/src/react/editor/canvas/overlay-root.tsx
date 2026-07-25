"use client";

/**
 * @file `AuthoringOverlayRoot` (PLAN-0020 CORE-P1B-003; DD-0019
 * §13.2 integration rules).
 *
 * The in-iframe overlay layer every canvas visual builds on:
 *
 * - the container is a **body-level sibling of `#frame-root`** —
 *   mounting inside it would feed `CanvasIframe`'s height-measurement
 *   MutationObserver loop (verified rule). A zero-height absolutely
 *   positioned host keeps `frameRoot.scrollHeight` untouched;
 * - children position at **content coordinates** (element rect +
 *   iframe scroll), so visuals scroll with the document naturally;
 * - the base layer is `pointer-events: none`; interactive overlay
 *   elements (handles, marquee) opt in per element AND register
 *   through Puck's `registerOverlayPortal` (via
 *   {@link useOverlayPortalRegistration}) so Puck's parent-window
 *   drag re-dispatch keeps working over them;
 * - the whole layer pauses and remounts on **document replacement**
 *   (the portal container is keyed by the live document).
 *
 * Phase 1B-003 contents: multi-selection rings for every selected id
 * beyond the primary (Puck's own overlay already rings the primary
 * and handles hover). Handles (005), marquee (007), and announcements
 * (008) mount into the same root.
 */

import { registerOverlayPortal } from "@puckeditor/core";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useReducer,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { StudioEditorBridge } from "../bridge.js";

/** The overlay container element id (one per iframe document). */
export const OVERLAY_ROOT_ID = "ak-authoring-overlay-root";

/**
 * Register an interactive overlay element with Puck's overlay-portal
 * system for the lifetime of the ref's element. Non-interactive
 * visuals must NOT register (they stay `pointer-events: none`).
 */
export function useOverlayPortalRegistration(
	ref: RefObject<HTMLElement | null>,
	options?: { readonly disableDrag?: boolean },
): void {
	useEffect(() => {
		const element = ref.current;
		if (element === null) {
			return;
		}
		return registerOverlayPortal(element, options);
	}, [ref, options]);
}

function ensureContainer(doc: Document): HTMLElement {
	const existing = doc.getElementById(OVERLAY_ROOT_ID);
	if (existing !== null) {
		return existing;
	}
	const container = doc.createElement("div");
	container.id = OVERLAY_ROOT_ID;
	// Zero-height, non-interactive host anchored at the document
	// origin: children use absolute content coordinates and scroll
	// with the page; `overflow: visible` lets rings escape the 0-box.
	container.style.position = "absolute";
	container.style.top = "0";
	container.style.left = "0";
	container.style.width = "100%";
	container.style.height = "0";
	container.style.overflow = "visible";
	container.style.pointerEvents = "none";
	container.style.zIndex = "2147483000";
	doc.body.appendChild(container);
	return container;
}

/** One selection ring at content coordinates. */
function SelectionRing({
	nodeId,
	bridge,
	doc,
}: {
	readonly nodeId: string;
	readonly bridge: StudioEditorBridge;
	readonly doc: Document;
}): ReactNode {
	const element = bridge.canvasRegistry?.getPrimaryElement(nodeId) ?? null;
	if (element === null) {
		return null;
	}
	const rect = element.getBoundingClientRect();
	const view = doc.defaultView;
	const x = rect.left + (view?.scrollX ?? 0);
	const y = rect.top + (view?.scrollY ?? 0);
	return (
		<div
			data-ak-selection-ring={nodeId}
			style={{
				position: "absolute",
				left: `${x}px`,
				top: `${y}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				boxSizing: "border-box",
				border: "1px solid var(--editor-selection, #3b82f6)",
				borderRadius: "2px",
				pointerEvents: "none",
			}}
		/>
	);
}

/** Props for {@link AuthoringOverlayRoot}. */
export interface AuthoringOverlayRootProps {
	readonly bridge: StudioEditorBridge;
	/** Extra overlay content (handles, marquee) from later tasks. */
	readonly children?: ReactNode;
}

/** The overlay layer, portaled into the live iframe document. */
export function AuthoringOverlayRoot({
	bridge,
	children,
}: AuthoringOverlayRootProps): ReactNode {
	// Track the live document through the bridge (replacement = new
	// snapshot → the portal container re-derives and the old layer
	// unmounts with the old document).
	const doc = useSyncExternalStore(
		bridge.subscribe,
		() => bridge.canvasDocument,
		() => bridge.canvasDocument,
	);
	// General version subscription: selection changes, registry installs,
	// and commits all bump it — rings track the live state.
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const [, bump] = useReducer((count: number) => count + 1, 0);
	const [container, setContainer] = useState<HTMLElement | null>(null);

	// (Re)create the container per document; remove it on teardown so a
	// paused overlay leaves no stray DOM in the old document.
	useEffect(() => {
		if (doc === null) {
			setContainer(null);
			return;
		}
		const element = ensureContainer(doc);
		setContainer(element);
		return () => {
			element.remove();
			setContainer(null);
		};
	}, [doc]);

	// Reposition on structure changes, scroll, and resize.
	useEffect(() => {
		if (doc === null) {
			return;
		}
		const view = doc.defaultView;
		const unobserve = bridge.canvasRegistry?.observe(bump);
		view?.addEventListener("scroll", bump, { passive: true });
		view?.addEventListener("resize", bump, { passive: true });
		return () => {
			unobserve?.();
			view?.removeEventListener("scroll", bump);
			view?.removeEventListener("resize", bump);
		};
	}, [doc, bridge]);

	if (doc === null || container === null) {
		return null;
	}
	const selection = bridge.selection?.getState();
	const rings =
		selection === undefined
			? []
			: selection.selectedIds.filter((id) => id !== selection.primaryId);
	return createPortal(
		<>
			{rings.map((nodeId) => (
				<SelectionRing key={nodeId} nodeId={nodeId} bridge={bridge} doc={doc} />
			))}
			{children}
		</>,
		container,
	);
}
