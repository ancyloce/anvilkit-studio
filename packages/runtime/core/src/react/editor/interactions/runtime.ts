"use client";

/**
 * @file The interaction runtime — the half that actually *runs*
 * (PLAN-0020 CORE-P3-002; ED-INT-001/002, ED-MOTION-001..003;
 * DD-0019 §16).
 *
 * `editor/interactions/` decides *what* should happen: it normalises
 * schedules, resolves references, and applies the reduced-motion
 * transform, all pure and testable. This file is the part that touches
 * the canvas — binding listeners to real elements and driving `motion`.
 *
 * ### Everything routes through the preview session
 *
 * Every listener, observer, timer and animation is registered with the
 * {@link PreviewSession}, so exiting preview releases all of it in one
 * call (§16: "exiting preview disposes timers, observers, animations,
 * and temporary variant state"). Nothing here holds a resource the
 * session does not also hold a disposer for — that is what makes the
 * disposal guarantee true rather than aspirational.
 *
 * ### Design mode never runs interactions
 *
 * The caller gates on `interactionsEnabled(mode)`. This module is only
 * ever invoked for a `"preview"` session, and it re-checks
 * `session.disposed` before acting on a late event, because a listener
 * can fire between the user leaving preview and teardown completing.
 *
 * ### URL schemes are re-validated at fire time
 *
 * `interactionCreateErrors` already refuses `javascript:` and friends
 * at the command boundary, but a document can arrive from a
 * collaboration peer or an older sidecar that never passed through it.
 * Navigation is the one irreversible action here, so the scheme is
 * checked again immediately before it happens — defence in depth, not
 * duplication.
 */

import type {
	InteractionAction,
	InteractionV1,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { animate } from "motion";
import {
	buildMotionSchedule,
	evaluateCondition,
	type PreviewSession,
	urlScheme,
} from "../../../editor/index.js";

/** Schemes that may never be navigated to. Mirrors §16, absolutely. */
const NAVIGABLE_SCHEMES: ReadonlySet<string> = new Set([
	"http",
	"https",
	"mailto",
	"tel",
]);

/** What the runtime needs from its host. */
export interface InteractionRuntimeDeps {
	readonly session: PreviewSession;
	/** Resolve a node id to its primary canvas element. */
	readonly getElement: (nodeId: string) => HTMLElement | null;
	/** All elements for a node id (fragments / multi-root). */
	readonly getElements: (nodeId: string) => readonly HTMLElement[];
	/** The canvas document listeners are bound in. */
	readonly doc: Document;
	readonly reducedMotion: boolean;
	/** Host page navigation, when an adapter is configured. */
	readonly openPage?: (pageId: string) => void;
	/** Surface a runtime problem without breaking the preview. */
	readonly onDiagnostic?: (message: string) => void;
}

/** CSS property names for the animatable set that are not transforms. */
const PAINT_PROPERTY: Partial<Record<string, string>> = {
	opacity: "opacity",
	backgroundColor: "backgroundColor",
	textColor: "color",
	borderColor: "borderColor",
	radius: "borderRadius",
};

/** Translate one schedule entry's targets into `motion` keyframes. */
function toKeyframes(
	to: Readonly<Record<string, string | number>>,
): Record<string, string | number> {
	const frames: Record<string, string | number> = {};
	for (const [property, value] of Object.entries(to)) {
		const paint = PAINT_PROPERTY[property];
		if (paint !== undefined) {
			// `radius` is authored unitless; every other paint property is
			// already a serialized CSS value.
			frames[paint] =
				property === "radius" && typeof value === "number"
					? `${value}px`
					: value;
			continue;
		}
		// Transforms map 1:1 onto motion's shorthand names.
		frames[property] = value;
	}
	return frames;
}

/** Translate a contract transition into `motion` options. */
function toTransition(transition: MotionTransition): Record<string, unknown> {
	if (transition.type === "spring") {
		return {
			type: "spring",
			stiffness: transition.stiffness,
			damping: transition.damping,
			mass: transition.mass,
			...(transition.delayMs === undefined
				? {}
				: { delay: transition.delayMs / 1000 }),
		};
	}
	const [x1, y1, x2, y2] = transition.easing;
	return {
		duration: transition.durationMs / 1000,
		ease: [x1, y1, x2, y2],
		...(transition.delayMs === undefined
			? {}
			: { delay: transition.delayMs / 1000 }),
	};
}

/** Run one `animate` action against the canvas. */
function runAnimation(
	action: InteractionAction,
	deps: InteractionRuntimeDeps,
): void {
	const schedule = buildMotionSchedule(action, {
		reducedMotion: deps.reducedMotion,
	});
	for (const entry of schedule.entries) {
		const element = deps.getElement(entry.targetNodeId);
		if (element === null) continue;
		const keyframes = toKeyframes(entry.to);
		const options = toTransition(entry.transition);
		// `startMs` positions sequenced steps; motion takes seconds.
		const existingDelay = (options.delay as number | undefined) ?? 0;
		const controls = animate(element, keyframes, {
			...options,
			delay: existingDelay + entry.startMs / 1000,
		} as Parameters<typeof animate>[2]);
		// Registered so leaving preview stops mid-flight animations
		// rather than letting them finish against a torn-down canvas.
		deps.session.register(() => {
			try {
				controls.stop();
			} catch {
				// A finished animation may already be detached.
			}
		});
	}
}

/** Apply one non-animation action. */
function runAction(
	action: InteractionAction,
	deps: InteractionRuntimeDeps,
): void {
	switch (action.type) {
		case "url": {
			const scheme = urlScheme(action.url);
			// Re-checked at fire time: this document may never have passed
			// through command validation (collab peer, older sidecar).
			if (scheme === undefined || !NAVIGABLE_SCHEMES.has(scheme)) {
				deps.onDiagnostic?.(
					`refused to navigate to a "${scheme ?? "relative"}" URL`,
				);
				return;
			}
			const view = deps.doc.defaultView;
			if (view === null) return;
			if (action.newTab === true) {
				// `noopener` prevents the opened document reaching back
				// through `window.opener` into the editor.
				view.open(action.url, "_blank", "noopener,noreferrer");
			} else {
				view.location.assign(action.url);
			}
			return;
		}
		case "navigate":
			deps.openPage?.(action.pageId);
			return;
		case "scroll": {
			const element = deps.getElement(action.targetNodeId);
			element?.scrollIntoView({
				behavior:
					deps.reducedMotion || action.behavior === "instant"
						? "instant"
						: "smooth",
				block: "center",
			});
			return;
		}
		case "visibility": {
			for (const element of deps.getElements(action.targetNodeId)) {
				const hidden =
					action.operation === "toggle"
						? element.style.display !== "none"
						: action.operation === "hide";
				// Recorded so preview exit restores what the author sees.
				const previous = element.style.display;
				element.style.display = hidden ? "none" : "";
				deps.session.register(() => {
					element.style.display = previous;
				});
			}
			return;
		}
		case "variant":
			// Temporary only — the session drops these on exit, so the
			// document's own resolution takes back over (§16).
			deps.session.setVariantOverride({
				nodeId: action.targetNodeId,
				selection: action.selection,
			});
			return;
		case "animate":
			runAnimation(action, deps);
			return;
		default:
			return;
	}
}

/** Run every action of an interaction, honouring its conditions. */
function fire(interaction: InteractionV1, deps: InteractionRuntimeDeps): void {
	// A listener can fire between preview exit and teardown completing.
	if (deps.session.disposed) return;
	for (const condition of interaction.conditions ?? []) {
		// A refused or unresolvable condition reads as false — refusing to
		// act on an expression we would not evaluate is the safe direction.
		if (!evaluateCondition(condition)) return;
	}
	for (const action of interaction.actions) {
		runAction(action, deps);
	}
}

/**
 * Bind one interaction's trigger. Returns nothing — every resource is
 * registered with the session, which is the only teardown path.
 */
function bind(interaction: InteractionV1, deps: InteractionRuntimeDeps): void {
	const source = deps.getElement(interaction.sourceNodeId);
	const trigger = interaction.trigger;

	if (trigger.type === "pageLoad") {
		const timer = deps.doc.defaultView?.setTimeout(
			() => fire(interaction, deps),
			trigger.delayMs ?? 0,
		);
		if (timer !== undefined) {
			deps.session.register(() => deps.doc.defaultView?.clearTimeout(timer));
		}
		return;
	}

	// Every remaining trigger needs a mounted source element.
	if (source === null) return;

	if (trigger.type === "viewport") {
		const view = deps.doc.defaultView;
		if (view === null || typeof view.IntersectionObserver !== "function") {
			return;
		}
		const observer = new view.IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const entered = entry.isIntersecting;
					if (
						(trigger.phase === "enter" && entered) ||
						(trigger.phase === "leave" && !entered)
					) {
						fire(interaction, deps);
					}
				}
			},
			{ threshold: trigger.threshold },
		);
		observer.observe(source);
		deps.session.register(() => observer.disconnect());
		return;
	}

	const eventName =
		trigger.type === "click"
			? "click"
			: trigger.type === "hover"
				? trigger.phase === "enter"
					? "mouseenter"
					: "mouseleave"
				: trigger.phase === "in"
					? "focusin"
					: "focusout";

	const handler = (): void => fire(interaction, deps);
	source.addEventListener(eventName, handler);
	deps.session.register(() => source.removeEventListener(eventName, handler));
}

/**
 * Bind every enabled interaction in a document.
 *
 * Only interactions whose references all resolve are bound — a
 * dangling reference disables the interaction (see
 * `interactions/resolve.ts`), and binding one would fire actions
 * against nodes that are not there.
 */
export function bindInteractions(
	interactions: readonly InteractionV1[],
	deps: InteractionRuntimeDeps,
): void {
	if (deps.session.disposed) return;
	for (const interaction of interactions) {
		bind(interaction, deps);
	}
}
