"use client";

/**
 * @file Canvas handles (PLAN-0028 `p4-006`; originally PLAN-0020
 * CORE-P1B-005/-008).
 *
 * Rendered inside the authoring overlay for the PRIMARY selected node.
 *
 * ### Node-addressed, in page mode, on purpose
 *
 * Every handle writes `nodeIds: [nodeId]` at the node's ROOT style
 * target. Target-addressed handles are explicitly out of scope:
 * PLAN-0026 §8 rules out structural editing inside a component, and
 * `p5-003` gives component mode its affordances through the inspector
 * plus outlines rather than resize handles on a `cardTitle`.
 *
 * ### Eligibility is asked per GRANTED PROPERTY, of the root target
 *
 * - width / height / corner resize — grants `width` / `height`;
 * - gap — grants `gap`, with a flex/grid display;
 * - padding (all four edges) — grants `padding`;
 * - radius — grants `borderRadius`.
 *
 * The question goes to the *target*, not to the component
 * (`grantedTargetProperties`): a component granting `padding` only on
 * `cardTitle` must not show a padding handle whose root-target commit
 * would be rejected.
 *
 * Flow nodes are NOT movable by x/y — reordering stays with Puck's own
 * drop semantics; a move handle for `position: absolute` nodes is not
 * shipped, so drag-to-move has no canvas surface yet (drag-to-resize and
 * drag-to-space do).
 *
 * ### Reads
 *
 * Pixel geometry comes from `getBoundingClientRect` / `getComputedStyle`
 * on the live element — the SAME rendered DOM the compiled stylesheet
 * styles, which is what makes "what the author drags" and "what
 * production renders" the same thing (Puck contract rule 3). Authored
 * state — capability, lock, and the merge base for per-edge properties —
 * comes from the read model through `canvas/appearance.ts`.
 *
 * ### Writes, and drag coalescing
 *
 * Drags run the gesture controller: pointermove paints **ephemeral
 * inline styles** on the target element (cleared on cancel) and writes
 * nothing; pointerup makes exactly ONE `commitCanvasAppearance` call, so
 * a resize gesture is one history entry and one undo restores the
 * pre-drag size. The corner handle's width AND height ride that same
 * single dispatch. Inside the iframe, pointer coordinates are already
 * content-space at every zoom (the browser inverse-maps events through
 * the parent transform), so deltas need no zoom math.
 *
 * ### Accessibility
 *
 * Every handle is a real button with an accessible name; arrow keys
 * nudge ±1 (Shift ±10) — each press one commit; a polite live region
 * announces the final value and the active breakpoint after every
 * commit.
 */

import type {
	AuthorableStyleProperty,
	CssBoxEdges,
	CssLength,
} from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useMsg } from "@/state/editor-i18n-context";
import { ROOT_STYLE_TARGET_ID } from "../../../../puck/targets.js";
import type { AppearancePatch } from "../../../../puck/update-appearance.js";
import type { StudioEditorBridge } from "../../bridge.js";
import type { InternalEditorCommandPort } from "../../command-port.js";
import {
	type CanvasCommitDeps,
	commitCanvasAppearance,
	grantedTargetProperties,
	isCanvasNodeLocked,
	readAuthoredProperty,
} from "../appearance.js";
import { isElementNode } from "../dom-registry.js";
import type { CanvasRect } from "../geometry.js";
import {
	createGestureController,
	type GestureController,
} from "../gesture-controller.js";
import { useOverlayPortalRegistration } from "../overlay-root.js";
import { resolveSnap, SNAP_SCAN_LIMIT, type SnapResult } from "../snap.js";

type HandleId =
	| "resize-e"
	| "resize-s"
	| "resize-se"
	| "gap"
	| "padding-top"
	| "padding-right"
	| "padding-bottom"
	| "padding-left"
	| "radius";

/** Everything a handle needs to turn a px value into appearance patches. */
interface HandlePatchInput {
	readonly value: number;
	readonly secondary: number | undefined;
	/** The root target's granted properties (the eligibility answer). */
	readonly granted: ReadonlySet<AuthorableStyleProperty>;
	/**
	 * The effective authored value of {@link HandleDefinition.mergeProperty},
	 * so a per-edge write preserves the edges it does not touch.
	 */
	readonly merge: unknown;
}

interface HandleDefinition {
	readonly id: HandleId;
	readonly labelKey: string;
	/** Which delta component drives the value. */
	readonly axis: "x" | "y";
	/**
	 * Inward-drag handles (padding right/bottom/left) grow their value
	 * against the axis delta.
	 */
	readonly invert?: boolean;
	/**
	 * Properties this handle authors. Eligibility is "the root target
	 * grants at least one of these"; the patch builder then emits only
	 * the ones actually granted, so a partially-capable component gets a
	 * partially-capable handle rather than a rejected commit.
	 */
	readonly properties: readonly AuthorableStyleProperty[];
	/**
	 * A property whose CURRENT authored value must be read before
	 * writing, because the write is a partial update of a compound value
	 * (per-edge `padding`). Absent for scalar and fully-replaced values.
	 */
	readonly mergeProperty?: AuthorableStyleProperty;
	/** Base value reader (px) from the element's current geometry. */
	readonly read: (element: HTMLElement) => number;
	/**
	 * Secondary-axis reader — only the corner resize sets it; the
	 * secondary value rides the same patch/paint calls.
	 */
	readonly readSecondary?: (element: HTMLElement) => number;
	/** Build the appearance patches for an absolute px value. */
	readonly patches: (input: HandlePatchInput) => readonly AppearancePatch[];
	/** Ephemeral preview painter. */
	readonly paint: (
		element: HTMLElement,
		value: number,
		secondary?: number,
	) => void;
	readonly clear: (element: HTMLElement) => void;
	/**
	 * Resize handles snap their moving edge. Returns the degenerate edge
	 * rect for a proposed value pair, in content coordinates relative to
	 * the start rect.
	 */
	readonly snapEdge?: (
		start: { x: number; y: number; width: number; height: number },
		value: number,
		secondary: number,
	) => { x: number; y: number; width: number; height: number };
	/** Overlay placement relative to the node rect (content px). */
	readonly place: (rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) => { left: number; top: number };
}

function px(value: number): CssLength {
	return { kind: "unit", value: Math.max(0, Math.round(value)), unit: "px" };
}

/** One `set-property` patch, or nothing when the target does not grant it. */
function setProperty(
	granted: ReadonlySet<AuthorableStyleProperty>,
	property: AuthorableStyleProperty,
	value: unknown,
): readonly AppearancePatch[] {
	return granted.has(property)
		? [{ kind: "set-property", property, value }]
		: [];
}

const HANDLES: readonly HandleDefinition[] = [
	{
		id: "resize-e",
		labelKey: "studio.editor.canvas.handle.width",
		axis: "x",
		properties: ["width"],
		read: (element) => element.getBoundingClientRect().width,
		patches: ({ value, granted }) => setProperty(granted, "width", px(value)),
		paint: (element, value) => {
			element.style.width = `${Math.max(0, value)}px`;
		},
		clear: (element) => {
			element.style.removeProperty("width");
		},
		snapEdge: (start, value) => ({
			x: start.x + Math.max(0, value),
			y: start.y,
			width: 0,
			height: start.height,
		}),
		place: (rect) => ({
			left: rect.x + rect.width - 4,
			top: rect.y + rect.height / 2 - 4,
		}),
	},
	{
		id: "resize-s",
		labelKey: "studio.editor.canvas.handle.height",
		axis: "y",
		properties: ["height"],
		read: (element) => element.getBoundingClientRect().height,
		patches: ({ value, granted }) => setProperty(granted, "height", px(value)),
		paint: (element, value) => {
			element.style.height = `${Math.max(0, value)}px`;
		},
		clear: (element) => {
			element.style.removeProperty("height");
		},
		snapEdge: (start, value) => ({
			x: start.x,
			y: start.y + Math.max(0, value),
			width: start.width,
			height: 0,
		}),
		place: (rect) => ({
			left: rect.x + rect.width / 2 - 4,
			top: rect.y + rect.height - 4,
		}),
	},
	{
		id: "resize-se",
		labelKey: "studio.editor.canvas.handle.resize",
		axis: "x",
		properties: ["width", "height"],
		read: (element) => element.getBoundingClientRect().width,
		readSecondary: (element) => element.getBoundingClientRect().height,
		// Width AND height in ONE intent — both ops ride a single
		// history-recording dispatch, so a corner drag is one undo.
		patches: ({ value, secondary, granted }) => [
			...setProperty(granted, "width", px(value)),
			...(secondary === undefined
				? []
				: setProperty(granted, "height", px(secondary))),
		],
		paint: (element, value, secondary) => {
			element.style.width = `${Math.max(0, value)}px`;
			if (secondary !== undefined) {
				element.style.height = `${Math.max(0, secondary)}px`;
			}
		},
		clear: (element) => {
			element.style.removeProperty("width");
			element.style.removeProperty("height");
		},
		snapEdge: (start, value, secondary) => ({
			x: start.x + Math.max(0, value),
			y: start.y + Math.max(0, secondary),
			width: 0,
			height: 0,
		}),
		place: (rect) => ({
			left: rect.x + rect.width - 4,
			top: rect.y + rect.height - 4,
		}),
	},
	{
		id: "gap",
		labelKey: "studio.editor.canvas.handle.gap",
		axis: "x",
		properties: ["gap"],
		read: (element) => {
			const raw =
				element.ownerDocument.defaultView?.getComputedStyle(element).columnGap;
			const value = Number.parseFloat(raw ?? "0");
			return Number.isFinite(value) ? value : 0;
		},
		patches: ({ value, granted }) => setProperty(granted, "gap", px(value)),
		paint: (element, value) => {
			element.style.gap = `${Math.max(0, value)}px`;
		},
		clear: (element) => {
			element.style.removeProperty("gap");
		},
		place: (rect) => ({
			left: rect.x + rect.width / 2 - 4,
			top: rect.y + 8,
		}),
	},
	...(
		[
			{
				id: "padding-top" as const,
				labelKey: "studio.editor.canvas.handle.paddingTop",
				axis: "y" as const,
				invert: false,
				cssProperty: "paddingTop" as const,
				removeProperty: "padding-top",
				edge: "top" as const,
				place: (rect: { x: number; y: number; width: number }) => ({
					left: rect.x + 8,
					top: rect.y + 2,
				}),
			},
			{
				id: "padding-right" as const,
				labelKey: "studio.editor.canvas.handle.paddingRight",
				axis: "x" as const,
				invert: true,
				cssProperty: "paddingRight" as const,
				removeProperty: "padding-right",
				edge: "right" as const,
				place: (rect: {
					x: number;
					y: number;
					width: number;
					height: number;
				}) => ({
					left: rect.x + rect.width - 10,
					top: rect.y + rect.height / 2 + 8,
				}),
			},
			{
				id: "padding-bottom" as const,
				labelKey: "studio.editor.canvas.handle.paddingBottom",
				axis: "y" as const,
				invert: true,
				cssProperty: "paddingBottom" as const,
				removeProperty: "padding-bottom",
				edge: "bottom" as const,
				place: (rect: {
					x: number;
					y: number;
					width: number;
					height: number;
				}) => ({
					left: rect.x + 8,
					top: rect.y + rect.height - 10,
				}),
			},
			{
				id: "padding-left" as const,
				labelKey: "studio.editor.canvas.handle.paddingLeft",
				axis: "x" as const,
				invert: false,
				cssProperty: "paddingLeft" as const,
				removeProperty: "padding-left",
				edge: "left" as const,
				place: (rect: { x: number; y: number; height: number }) => ({
					left: rect.x + 2,
					top: rect.y + rect.height / 2 + 8,
				}),
			},
		] satisfies readonly {
			id: HandleId;
			labelKey: string;
			axis: "x" | "y";
			invert: boolean;
			cssProperty:
				| "paddingTop"
				| "paddingRight"
				| "paddingBottom"
				| "paddingLeft";
			removeProperty: string;
			edge: "top" | "right" | "bottom" | "left";
			place: HandleDefinition["place"];
		}[]
	).map(
		(spec): HandleDefinition => ({
			id: spec.id,
			labelKey: spec.labelKey,
			axis: spec.axis,
			invert: spec.invert,
			properties: ["padding"],
			// `padding` is ONE compound spec value, so writing an edge means
			// rewriting the whole value: without the current value as a merge
			// base, dragging the top edge would erase the other three.
			mergeProperty: "padding",
			read: (element) => {
				const raw =
					element.ownerDocument.defaultView?.getComputedStyle(element)[
						spec.cssProperty
					];
				const value = Number.parseFloat(raw ?? "0");
				return Number.isFinite(value) ? value : 0;
			},
			patches: ({ value, granted, merge }) =>
				setProperty(granted, "padding", {
					...((merge as CssBoxEdges | undefined) ?? {}),
					[spec.edge]: px(value),
				}),
			paint: (element, value) => {
				element.style[spec.cssProperty] = `${Math.max(0, value)}px`;
			},
			clear: (element) => {
				element.style.removeProperty(spec.removeProperty);
			},
			place: spec.place,
		}),
	),
	{
		id: "radius",
		labelKey: "studio.editor.canvas.handle.radius",
		axis: "x",
		properties: ["borderRadius"],
		read: (element) => {
			const raw =
				element.ownerDocument.defaultView?.getComputedStyle(
					element,
				).borderTopLeftRadius;
			const value = Number.parseFloat(raw ?? "0");
			return Number.isFinite(value) ? value : 0;
		},
		// All four corners are written, so there is nothing to merge.
		patches: ({ value, granted }) => {
			const radius = px(value);
			return setProperty(granted, "borderRadius", {
				topLeft: radius,
				topRight: radius,
				bottomRight: radius,
				bottomLeft: radius,
			});
		},
		paint: (element, value) => {
			element.style.borderRadius = `${Math.max(0, value)}px`;
		},
		clear: (element) => {
			element.style.removeProperty("border-radius");
		},
		place: (rect) => ({ left: rect.x + 2, top: rect.y + 2 }),
	},
];

/** The canvas zoom factor for an iframe document (1 outside one). */
function canvasZoomOf(doc: Document): number {
	const frame = doc.defaultView?.frameElement as HTMLElement | null | undefined;
	if (frame === null || frame === undefined) {
		return 1;
	}
	const rect = frame.getBoundingClientRect();
	const layout = frame.offsetWidth;
	return layout > 0 && rect.width > 0 ? rect.width / layout : 1;
}

/** Snap candidate context captured once per gesture (scan cap applies). */
function snapContextOf(
	bridge: StudioEditorBridge,
	element: HTMLElement,
	nodeId: string,
): {
	readonly siblings: readonly CanvasRect[];
	readonly parent: CanvasRect | undefined;
	readonly zoom: number;
} {
	const view = element.ownerDocument.defaultView;
	const scrollX = view?.scrollX ?? 0;
	const scrollY = view?.scrollY ?? 0;
	const toContent = (rect: DOMRect): CanvasRect => ({
		x: rect.left + scrollX,
		y: rect.top + scrollY,
		width: rect.width,
		height: rect.height,
	});
	const siblings: CanvasRect[] = [];
	const registry = bridge.canvasRegistry;
	if (registry !== null && registry !== undefined) {
		for (const id of registry.listNodeIds()) {
			if (id === nodeId) {
				continue;
			}
			const candidate = registry.getPrimaryElement(id);
			if (
				candidate === null ||
				candidate.contains(element) ||
				element.contains(candidate)
			) {
				continue;
			}
			siblings.push(toContent(candidate.getBoundingClientRect()));
			if (siblings.length >= SNAP_SCAN_LIMIT) {
				break;
			}
		}
	}
	const parentElement = element.parentElement;
	const parent =
		parentElement === null || parentElement === element.ownerDocument.body
			? undefined
			: toContent(parentElement.getBoundingClientRect());
	return { siblings, parent, zoom: canvasZoomOf(element.ownerDocument) };
}

function Handle({
	definition,
	element,
	nodeId,
	bridge,
	commitDeps,
	granted,
	layer,
	controller,
	announce,
	onSnap,
}: {
	readonly definition: HandleDefinition;
	readonly element: HTMLElement;
	readonly nodeId: string;
	readonly bridge: StudioEditorBridge;
	readonly commitDeps: CanvasCommitDeps;
	readonly granted: ReadonlySet<AuthorableStyleProperty>;
	readonly layer: ReturnType<
		NonNullable<StudioEditorBridge["responsive"]>["getActiveLayer"]
	>;
	readonly controller: GestureController;
	readonly announce: (text: string) => void;
	readonly onSnap: (result: SnapResult | null) => void;
}): ReactNode {
	const msg = useMsg();
	const ref = useRef<HTMLButtonElement | null>(null);
	useOverlayPortalRegistration(
		ref,
		useMemo(() => ({ disableDrag: true }), []),
	);

	const layerLabel =
		layer === "base" ? msg("studio.editor.responsive.base") : layer;

	/**
	 * The one write path of this handle: build the patches, commit them
	 * as ONE history entry, announce the result. Called once per gesture
	 * (on pointerup) and once per keyboard nudge — never per pointermove.
	 */
	const commitValue = useCallback(
		(value: number, secondary?: number): boolean => {
			const api = commitDeps.getPuckApi();
			if (api === null) {
				return false;
			}
			const merge =
				definition.mergeProperty === undefined
					? undefined
					: readAuthoredProperty(
							api,
							nodeId,
							ROOT_STYLE_TARGET_ID,
							definition.mergeProperty,
							layer,
						);
			const patches = definition.patches({
				value,
				secondary,
				granted,
				merge,
			});
			if (patches.length === 0) {
				return false;
			}
			const result = commitCanvasAppearance(commitDeps, {
				layer,
				ops: patches.map((patch) => ({ nodeIds: [nodeId], patch })),
			});
			// A refused write must say so rather than look like a no-op.
			bridge.diagnostics.setDiagnostics(
				"canvas.appearance",
				result.status === "rejected" ? result.errors : [],
			);
			announce(
				`${msg(definition.labelKey)} ${Math.max(0, Math.round(value))}px (${layerLabel})`,
			);
			return result.status === "committed";
		},
		[
			commitDeps,
			definition,
			nodeId,
			layer,
			granted,
			bridge,
			announce,
			msg,
			layerLabel,
		],
	);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>): void => {
			event.preventDefault();
			event.stopPropagation();
			try {
				event.currentTarget.setPointerCapture?.(event.pointerId);
			} catch {
				// jsdom / unsupported pointer capture: move events still
				// arrive through the document listeners below.
			}
			const startValue = definition.read(element);
			const startSecondary = definition.readSecondary?.(element);
			const view = element.ownerDocument.defaultView;
			const startClientRect = element.getBoundingClientRect();
			const startRect = {
				x: startClientRect.left + (view?.scrollX ?? 0),
				y: startClientRect.top + (view?.scrollY ?? 0),
				width: startClientRect.width,
				height: startClientRect.height,
			};
			// Candidate rects + zoom are captured once per gesture (≤500
			// scanned elements per calculation).
			const snapContext =
				definition.snapEdge === undefined
					? null
					: snapContextOf(bridge, element, nodeId);
			const modifiers = { alt: false, shift: false };
			let lastValue = startValue;
			let lastSecondary = startSecondary;

			/** Proposed → snapped value pair for a raw gesture delta. */
			const resolveValues = (delta: {
				readonly x: number;
				readonly y: number;
			}): { value: number; secondary: number | undefined } => {
				const sign = definition.invert === true ? -1 : 1;
				let value =
					startValue + (definition.axis === "x" ? delta.x : delta.y) * sign;
				let secondary =
					startSecondary === undefined ? undefined : startSecondary + delta.y;
				// Shift on the corner handle locks the aspect ratio;
				// single-axis handles are locked by construction.
				if (modifiers.shift && secondary !== undefined) {
					secondary =
						startSecondary === undefined || startValue <= 0
							? secondary
							: (startSecondary * Math.max(0, value)) / startValue;
				}
				if (definition.snapEdge !== undefined && snapContext !== null) {
					const resolved = resolveSnap({
						moving: definition.snapEdge(startRect, value, secondary ?? 0),
						siblings: snapContext.siblings,
						parent: snapContext.parent,
						zoom: snapContext.zoom,
						disabled: modifiers.alt,
					});
					if (definition.axis === "x") {
						value += resolved.x?.delta ?? 0;
					} else {
						value += resolved.y?.delta ?? 0;
					}
					if (secondary !== undefined && !modifiers.shift) {
						secondary += resolved.y?.delta ?? 0;
					}
					// Surface only the axes this handle can apply.
					onSnap({
						x: definition.axis === "x" ? resolved.x : null,
						y:
							definition.axis === "y" || secondary !== undefined
								? resolved.y
								: null,
						spacingLabels: resolved.spacingLabels,
					});
				}
				return { value, secondary };
			};

			controller.arm(
				{
					gesture: definition.id,
					preview: (delta) => {
						const next = resolveValues(delta);
						lastValue = next.value;
						lastSecondary = next.secondary;
						definition.paint(element, lastValue, lastSecondary);
					},
					clearPreview: () => {
						definition.clear(element);
						onSnap(null);
					},
					// ONE commit for the whole drag: every pointermove above
					// only painted DOM.
					commit: () => {
						onSnap(null);
						return commitValue(lastValue, lastSecondary);
					},
				},
				{ x: event.clientX, y: event.clientY },
			);

			const doc = element.ownerDocument;
			const onMove = (move: PointerEvent): void => {
				modifiers.alt = move.altKey;
				modifiers.shift = move.shiftKey;
				controller.move({ x: move.clientX, y: move.clientY });
			};
			const teardown = (): void => {
				doc.removeEventListener("pointermove", onMove);
				doc.removeEventListener("pointerup", onUp);
				doc.removeEventListener("pointercancel", onCancel);
				doc.removeEventListener("keydown", onKey, true);
			};
			const onUp = (): void => {
				controller.finish();
				teardown();
			};
			const onCancel = (): void => {
				controller.cancel("pointercancel");
				teardown();
			};
			const onKey = (key: KeyboardEvent): void => {
				if (key.key === "Escape") {
					key.preventDefault();
					key.stopPropagation();
					controller.cancel("escape");
					teardown();
				}
			};
			doc.addEventListener("pointermove", onMove);
			doc.addEventListener("pointerup", onUp);
			doc.addEventListener("pointercancel", onCancel);
			doc.addEventListener("keydown", onKey, true);
		},
		[definition, element, nodeId, bridge, controller, commitValue, onSnap],
	);

	// Keyboard equivalent: arrows nudge the value directly, one commit
	// per press.
	const onKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>): void => {
			const growKeys =
				definition.axis === "x"
					? ["ArrowRight", "ArrowUp"]
					: ["ArrowDown", "ArrowRight"];
			const shrinkKeys =
				definition.axis === "x"
					? ["ArrowLeft", "ArrowDown"]
					: ["ArrowUp", "ArrowLeft"];
			let step = 0;
			if (growKeys.includes(event.key)) {
				step = event.shiftKey ? 10 : 1;
			} else if (shrinkKeys.includes(event.key)) {
				step = event.shiftKey ? -10 : -1;
			} else {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			// No secondary: a keyboard nudge moves the handle's own axis, so
			// the corner handle must not also re-write the unchanged height.
			commitValue(definition.read(element) + step);
		},
		[definition, element, commitValue],
	);

	// Document-level capture listener scoped to this handle: the
	// button lives in the iframe document via a cross-document portal,
	// where neither React's delegated synthetic events nor per-element
	// pointer listeners deliver reliably in every embedding — a
	// capture listener on the owning document provably does, and it is
	// the standard overlay interaction pattern.
	useEffect(() => {
		const node = ref.current;
		if (node === null) {
			return;
		}
		const doc = node.ownerDocument;
		const down = (event: Event): void => {
			const target = event.target;
			if (
				!isElementNode(target) ||
				(target !== node && target.closest("[data-ak-handle]") !== node)
			) {
				return;
			}
			const pointer = event as PointerEvent;
			onPointerDown({
				preventDefault: () => event.preventDefault(),
				stopPropagation: () => event.stopPropagation(),
				clientX: pointer.clientX,
				clientY: pointer.clientY,
				pointerId: pointer.pointerId ?? 1,
				currentTarget: node,
			} as unknown as ReactPointerEvent<HTMLButtonElement>);
		};
		const key = (event: Event): void => {
			const target = event.target;
			if (
				!isElementNode(target) ||
				(target !== node && target.closest("[data-ak-handle]") !== node)
			) {
				return;
			}
			onKeyDown(event as unknown as ReactKeyboardEvent<HTMLButtonElement>);
		};
		doc.addEventListener("pointerdown", down, true);
		doc.addEventListener("keydown", key, true);
		return () => {
			doc.removeEventListener("pointerdown", down, true);
			doc.removeEventListener("keydown", key, true);
		};
	}, [onPointerDown, onKeyDown]);

	const view = element.ownerDocument.defaultView;
	const rect = element.getBoundingClientRect();
	const position = definition.place({
		x: rect.left + (view?.scrollX ?? 0),
		y: rect.top + (view?.scrollY ?? 0),
		width: rect.width,
		height: rect.height,
	});

	return (
		<button
			ref={ref}
			type="button"
			data-ak-handle={definition.id}
			aria-label={`${msg(definition.labelKey)} — ${nodeId}`}
			title={msg(definition.labelKey)}
			style={{
				position: "absolute",
				left: `${position.left}px`,
				top: `${position.top}px`,
				width: "9px",
				height: "9px",
				padding: 0,
				boxSizing: "border-box",
				border: "1px solid var(--editor-selection, #3b82f6)",
				// `--ak-studio-panel`, not `--editor-panel`: only the
				// `--ak-studio-*` bridge is injected into the canvas iframe
				// (`theme/iframe-theme.ts`), so `--editor-panel` silently fell
				// back to #fff and pinned handles to light mode.
				background: "var(--ak-studio-panel, #fff)",
				borderRadius: definition.id === "radius" ? "50%" : "2px",
				cursor:
					definition.id === "resize-se"
						? "nwse-resize"
						: definition.axis === "x"
							? "ew-resize"
							: "ns-resize",
				pointerEvents: "auto",
			}}
		/>
	);
}

/** Props for {@link CanvasHandles}. */
export interface CanvasHandlesProps {
	readonly bridge: StudioEditorBridge;
}

/** The primary-selection handle set + the live announcement region. */
export function CanvasHandles({ bridge }: CanvasHandlesProps): ReactNode {
	const msg = useMsg();
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const [, bump] = useReducer((count: number) => count + 1, 0);
	const [announcement, setAnnouncement] = useState("");
	// Live snap guides + spacing labels of the active gesture.
	const [snapState, setSnapState] = useState<SnapResult | null>(null);

	const port = bridge.port as InternalEditorCommandPort | null;
	// The canvas overlay renders OUTSIDE `<Puck>` (see `canvas/appearance.ts`),
	// so the live api comes through the port's injection rather than
	// `useGetPuck`.
	const commitDeps = useMemo<CanvasCommitDeps>(
		() => ({ getPuckApi: () => port?.tryGetPuckApi?.() ?? null }),
		[port],
	);

	const controller = useMemo(
		() =>
			port === null
				? null
				: createGestureController({
						// Puck replaces `Data` on every dispatch, so its identity is
						// the foreign-change signal.
						getDocumentToken: () =>
							port.tryGetPuckApi?.()?.appState.data ?? null,
						onCompleted: (gesture, durationMs) => {
							bridge.diagnostics.emit({
								type: "gesture.completed",
								gesture,
								durationMs,
							});
						},
					}),
		[bridge, port],
	);

	// Reposition on registry/scroll changes.
	useEffect(() => {
		const doc = bridge.canvasDocument;
		const unobserve = bridge.canvasRegistry?.observe(bump);
		const view = doc?.defaultView;
		view?.addEventListener("scroll", bump, { passive: true });
		return () => {
			unobserve?.();
			view?.removeEventListener("scroll", bump);
		};
	}, [bridge, bridge.canvasDocument]);

	const selection = bridge.selection?.getState();
	const primary = selection?.primaryId;
	// Gesture suppression while an inline session is active.
	if (bridge.inline?.getSession() != null) {
		return null;
	}
	if (
		primary === undefined ||
		port === null ||
		controller === null ||
		port.writersDisabled() ||
		port.isReadOnly()
	) {
		return null;
	}
	const api: PuckApi | null = port.tryGetPuckApi?.() ?? null;
	const element = bridge.canvasRegistry?.getPrimaryElement(primary) ?? null;
	// A locked node refuses every mutating gesture: no handles at all, so
	// there is nothing to drag, resize or nudge (`p3-006` annotations).
	if (api === null || element === null || isCanvasNodeLocked(api, primary)) {
		return null;
	}

	// Eligibility is asked of the ROOT TARGET's granted property set, not
	// of the component: an affordance whose own commit would be rejected
	// must never be offered.
	const granted = grantedTargetProperties(api, primary, ROOT_STYLE_TARGET_ID);
	if (granted.size === 0) {
		return null;
	}
	const layer = bridge.responsive?.getActiveLayer() ?? "base";
	// Inline-style fallback: detached documents (tests, pre-attach
	// races) have no view to compute styles through.
	const display =
		element.ownerDocument.defaultView?.getComputedStyle(element).display ??
		element.style.display;
	const eligible = HANDLES.filter((definition) => {
		if (!definition.properties.some((property) => granted.has(property))) {
			return false;
		}
		// The gap handle additionally needs a container that actually gaps.
		return definition.id !== "gap" || display === "flex" || display === "grid";
	});
	if (eligible.length === 0) {
		return null;
	}

	const doc = element.ownerDocument;
	const guideExtent = {
		width: doc.documentElement.scrollWidth,
		height: doc.documentElement.scrollHeight,
	};
	const guides = [snapState?.x, snapState?.y].filter(
		(guide): guide is NonNullable<typeof guide> =>
			guide !== null && guide !== undefined,
	);

	return (
		<>
			{eligible.map((definition) => (
				<Handle
					key={definition.id}
					definition={definition}
					element={element}
					nodeId={primary}
					bridge={bridge}
					commitDeps={commitDeps}
					granted={granted}
					layer={layer}
					controller={controller}
					announce={setAnnouncement}
					onSnap={setSnapState}
				/>
			))}
			{/* Snap guides: one winning line per axis. */}
			{guides.map((guide) => (
				<div
					key={guide.axis}
					data-ak-snap-guide={guide.axis}
					data-ak-snap-kind={guide.kind}
					style={{
						position: "absolute",
						left: guide.axis === "x" ? `${guide.position}px` : "0",
						top: guide.axis === "y" ? `${guide.position}px` : "0",
						width: guide.axis === "x" ? "1px" : `${guideExtent.width}px`,
						height: guide.axis === "y" ? "1px" : `${guideExtent.height}px`,
						background: "var(--editor-snap-guide, #db2777)",
						pointerEvents: "none",
					}}
				/>
			))}
			{/* Spacing labels: post-snap gaps per axis. */}
			{(snapState?.spacingLabels ?? []).map((label) => (
				<div
					key={`${label.axis}-${label.at}`}
					data-ak-spacing-label={label.axis}
					style={{
						position: "absolute",
						left:
							label.axis === "x"
								? `${label.at}px`
								: `${element.getBoundingClientRect().left}px`,
						top:
							label.axis === "y"
								? `${label.at}px`
								: `${element.getBoundingClientRect().top}px`,
						transform: "translate(-50%, -50%)",
						font: "10px/1.4 system-ui, sans-serif",
						padding: "0 3px",
						borderRadius: "2px",
						background: "var(--editor-snap-guide, #db2777)",
						color: "#fff",
						pointerEvents: "none",
						whiteSpace: "nowrap",
					}}
				>
					{Math.round(label.gap)}
				</div>
			))}
			{/* Live region: final value + active breakpoint. */}
			<div
				aria-live="polite"
				data-ak-handle-announcer
				style={{
					position: "absolute",
					width: "1px",
					height: "1px",
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
				}}
			>
				{announcement !== ""
					? announcement
					: msg("studio.editor.canvas.handlesReady")}
			</div>
		</>
	);
}
