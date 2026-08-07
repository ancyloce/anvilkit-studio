/**
 * @file Interaction and motion contracts (DD-0019 §16).
 *
 * The normalized interaction contract: triggers, conditions, and a
 * closed action set. URLs are restricted to `http`, `https`, `mailto`,
 * and `tel` at schema-validation time; `javascript:` is always
 * rejected. Component-definition interactions are instance-scoped.
 */

import type { SafeCondition } from "./bindings.js";
import type { CubicBezier } from "./values.js";

/** Interaction identifier. */
export type InteractionId = string;

/** Interaction trigger (DD-0019 §16, verbatim). */
export type InteractionTrigger =
	| { readonly type: "click" }
	| { readonly type: "hover"; readonly phase: "enter" | "leave" }
	| { readonly type: "focus"; readonly phase: "in" | "out" }
	| {
			readonly type: "viewport";
			readonly phase: "enter" | "leave";
			readonly threshold: number;
	  }
	| { readonly type: "pageLoad"; readonly delayMs?: number };

/** Motion transition (DD-0019 §16, verbatim). */
export type MotionTransition =
	| {
			readonly type: "tween";
			readonly durationMs: number;
			readonly easing: CubicBezier;
			readonly delayMs?: number;
	  }
	| {
			readonly type: "spring";
			readonly stiffness: number;
			readonly damping: number;
			readonly mass: number;
			readonly delayMs?: number;
	  };

/**
 * The P0 animatable property set (DD-0019 §16). Width and height are
 * deliberately excluded (layout thrashing).
 */
export type AnimatableProperty =
	| "opacity"
	| "translateX"
	| "translateY"
	| "scale"
	| "rotate"
	| "backgroundColor"
	| "textColor"
	| "borderColor"
	| "radius";

/**
 * One animation step: target values plus the transition that carries
 * them. Color values are serialized CSS color strings produced by the
 * allowlisted serializer; numeric values are unitless or pixel-based
 * per property convention.
 */
export interface AnimationStep {
	readonly to: Readonly<Partial<Record<AnimatableProperty, string | number>>>;
	readonly transition: MotionTransition;
}

/**
 * The closed action set (ED-INT-002: navigate, URL, scroll,
 * visibility, variant, and animation families).
 */
export type InteractionAction =
	| { readonly type: "navigate"; readonly pageId: string }
	| { readonly type: "url"; readonly url: string; readonly newTab?: boolean }
	| {
			readonly type: "scroll";
			readonly targetNodeId: string;
			readonly behavior?: "smooth" | "instant";
	  }
	| {
			readonly type: "visibility";
			readonly targetNodeId: string;
			readonly operation: "show" | "hide" | "toggle";
			readonly transition?: MotionTransition;
	  }
	| {
			readonly type: "variant";
			readonly targetNodeId: string;
			/** Variant axis id → option id. */
			readonly selection: Readonly<Record<string, string>>;
	  }
	| {
			readonly type: "animate";
			readonly targetNodeIds: readonly string[];
			readonly steps: readonly AnimationStep[];
			readonly composition: "sequence" | "parallel";
			/** Per-target stagger delay for multi-target animations. */
			readonly staggerMs?: number;
	  };

/** A stored interaction (DD-0019 §16, verbatim). */
export interface Interaction {
	readonly version: "1";
	readonly id: InteractionId;
	readonly name: string;
	readonly sourceNodeId: string;
	readonly trigger: InteractionTrigger;
	readonly conditions?: readonly SafeCondition[];
	readonly actions: readonly InteractionAction[];
	readonly enabled: boolean;
}
