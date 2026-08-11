"use client";

/**
 * @file Component-mode canvas visuals (PLAN-0028 `p5-002`; PLAN-0026
 * §3.7.2 gesture table, §3.7.4 multi-instance truth).
 *
 * Two outline sets and one live region, all inside the authoring
 * overlay root — which is already `pointer-events: none` with per-child
 * opt-in (`canvas/overlay-root.tsx`), so this adds behaviour, not a
 * layer. Positions are content coordinates (element rect + iframe
 * scroll), the same maths `SelectionRing` uses, so outlines scroll with
 * the document.
 *
 * ### Every matched element, never "the" element
 *
 * A repeated target stamps ONE target id on EVERY instance it renders —
 * `blog-list` spreads `targetAttrs.card` once per post — and the style
 * compiler emits one exact-pair selector per `(node, target)`. Styling
 * `card` therefore styles *all* cards, so hovering or selecting `card`
 * outlines *all* cards and the live region states the count
 * (`studio.editor.target.multiInstance`). Showing one rect would be a
 * lie about what the next edit does; that is why `getTargetElements` is
 * plural at the type level (`p5-001`).
 *
 * A declared target with **no** element in the current render branch
 * (blog-list's empty state renders `root` only) draws nothing and
 * announces `studio.editor.target.absent` — never a phantom rect.
 *
 * ### Puck contract
 *
 * Rule 2: nothing rendered here is document state — outlines are a
 * projection of the selection controller's ephemeral `mode`/`targetId`.
 */

import { type ReactNode, useEffect, useReducer } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioEditorBridge } from "../bridge.js";
import { nodeTypeOf } from "./appearance.js";
import { declaredTargetLabel } from "./component-mode.js";
import type { CanvasStyleTargetRef } from "./dom-registry.js";

/** Outlines for every element stamped with one `(nodeId, targetId)`. */
function TargetOutline({
	bridge,
	doc,
	target,
	variant,
}: {
	readonly bridge: StudioEditorBridge;
	readonly doc: Document;
	readonly target: CanvasStyleTargetRef;
	readonly variant: "hover" | "selected";
}): ReactNode {
	const view = doc.defaultView;
	// Instances of a repeated target share BOTH ids, so the only thing
	// that distinguishes them is where they are. Content coordinates
	// (rect + scroll) are document-space and therefore scroll-invariant,
	// which makes them a stable key — it changes only when the layout
	// genuinely moves, and remounting a stateless outline then is correct.
	const outlines = (
		bridge.canvasRegistry?.getTargetElements(target.nodeId, target.targetId) ??
		[]
	).map((element, index) => {
		const rect = element.getBoundingClientRect();
		const x = rect.left + (view?.scrollX ?? 0);
		const y = rect.top + (view?.scrollY ?? 0);
		// Index first so the key is unique even when two instances share a
		// rect — overlapping cards, and every element in a layout-free
		// environment, where `getBoundingClientRect` is all zeros. Position
		// still drives the remount; it just can no longer collide, and a
		// collision would silently drop an outline the count still claims.
		return {
			key: `${index}:${x}:${y}:${rect.width}:${rect.height}`,
			x,
			y,
			rect,
		};
	});
	return (
		<>
			{outlines.map((outline) => (
				<div
					key={outline.key}
					data-ak-target-outline={target.targetId}
					data-ak-target-node={target.nodeId}
					data-ak-target-variant={variant}
					style={{
						position: "absolute",
						left: `${outline.x}px`,
						top: `${outline.y}px`,
						width: `${outline.rect.width}px`,
						height: `${outline.rect.height}px`,
						boxSizing: "border-box",
						border:
							variant === "selected"
								? "2px solid var(--editor-selection, #3b82f6)"
								: "1px dashed var(--editor-selection, #3b82f6)",
						borderRadius: "2px",
						pointerEvents: "none",
					}}
				/>
			))}
		</>
	);
}

/** Props for {@link ComponentTargetLayer}. */
export interface ComponentTargetLayerProps {
	readonly bridge: StudioEditorBridge;
	readonly doc: Document;
	/** The target under the pointer, or `null`. */
	readonly hovered: CanvasStyleTargetRef | null;
}

/**
 * The component-mode overlay: hover outlines, selection outlines and
 * the polite live region that names the active target.
 *
 * Renders nothing at all in page mode — page-mode hover and selection
 * are Puck's own node outlines and stay exactly as they were
 * (§3.7.1 rule 3).
 */
export function ComponentTargetLayer({
	bridge,
	doc,
	hovered,
}: ComponentTargetLayerProps): ReactNode {
	const msg = useMsg();
	// Follow the canvas DOM, not just the bridge version (`p5-004`).
	//
	// The parent (`canvas/marquee.tsx`) re-renders on `bridge.getVersion`,
	// and the overlay root's own registry subscription cannot reach here:
	// it re-renders with an unchanged `children` element, which React
	// bails out of. So without this, a document change that adds a card —
	// the exact §3.7.4 case — would repaint on whichever of the two
	// notifications happened to land last, and the outlines and the
	// announced count would be one render behind whenever it was the
	// MutationObserver's. Subscribing to the index that answers both
	// questions makes the ordering irrelevant. Same seam
	// `canvas/overlay-root.tsx:167` and `handles/CanvasHandles.tsx:903`
	// use; the whole subtree is outlines and one live region, so a bump
	// costs a handful of absolutely positioned divs.
	const [, bump] = useReducer((count: number) => count + 1, 0);
	const registry = bridge.canvasRegistry;
	useEffect(() => registry?.observe(bump), [registry]);

	const selection = bridge.selection?.getState();
	if (selection === undefined || selection.mode !== "component") {
		return null;
	}
	const primaryId = selection.primaryId;
	const targetId = selection.targetId;
	const selected: CanvasStyleTargetRef | null =
		primaryId === undefined || targetId === undefined
			? null
			: { nodeId: primaryId, targetId };
	// The hover outline is redundant once the pointer rests on the
	// selected target — drawing both would double-stroke it.
	const hover =
		hovered === null ||
		(selected !== null &&
			hovered.nodeId === selected.nodeId &&
			hovered.targetId === selected.targetId)
			? null
			: hovered;

	const api = bridge.getPuckApi();
	const matchCount =
		selected === null
			? 0
			: (bridge.canvasRegistry?.getTargetElements(
					selected.nodeId,
					selected.targetId,
				).length ?? 0);
	let announcement = "";
	if (selected !== null) {
		const componentName =
			api == null ? undefined : nodeTypeOf(api, selected.nodeId);
		const label =
			api == null
				? undefined
				: declaredTargetLabel(api, selected.nodeId, selected.targetId);
		const breadcrumb = msg("studio.editor.target.breadcrumb")
			.replace(
				"{component}",
				componentName ?? msg("studio.editor.mode.component"),
			)
			.replace("{target}", label ?? selected.targetId);
		const suffix =
			matchCount === 0
				? msg("studio.editor.target.absent")
				: matchCount > 1
					? msg("studio.editor.target.multiInstance").replace(
							"{count}",
							String(matchCount),
						)
					: "";
		announcement = suffix === "" ? breadcrumb : `${breadcrumb}. ${suffix}`;
	}

	return (
		<>
			{hover === null ? null : (
				<TargetOutline
					bridge={bridge}
					doc={doc}
					target={hover}
					variant="hover"
				/>
			)}
			{selected === null ? null : (
				<TargetOutline
					bridge={bridge}
					doc={doc}
					target={selected}
					variant="selected"
				/>
			)}
			{/* Live region: the active target, and how many elements the
			    next edit will reach (§3.7.4 — the count is never hidden). */}
			<div
				aria-live="polite"
				data-ak-target-announcer
				style={{
					position: "absolute",
					width: "1px",
					height: "1px",
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
				}}
			>
				{announcement === "" ? msg("studio.editor.target.list") : announcement}
			</div>
		</>
	);
}
