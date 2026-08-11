"use client";

/**
 * @file Inspector field-state computation (PLAN-0020 CORE-P1A-005;
 * DD-0019 §11.2–§11.3, ED-INSPECT-001/002).
 *
 * Pure helpers that project one property of one authoring family
 * across the current multi-selection into the
 * {@link InspectorFieldState} union the controls render:
 *
 * - `value` — every selected (capable) node agrees at the write layer;
 *   carries the §12.3 source/inheritance provenance for the
 *   value-source display.
 * - `mixed` — capable nodes disagree; controls render the mixed
 *   placeholder and a write fans out to the whole selection.
 * - `unset` — no capable node has the property anywhere in its
 *   cascade at the write layer; the resolved fallback (inherited or
 *   default) is carried for placeholder display.
 * - `unsupported` — no selected node's component declares the
 *   family's capability; the section/control hides or disables.
 *
 * The fifth union member (`invalid`) is deliberately **not** produced
 * here: invalid drafts are transient control state kept out of
 * durable stores (§11.3) — each control owns its draft until it
 * parses, then commits.
 *
 * ### What `p3-009` left
 *
 * The projection functions that computed this union from the sidecar
 * (`projectProperty`, `readFieldState`) died with it; the canonical
 * computation is `document-model/read-node-field.ts` (`p2-002`/`p2-003`),
 * which is target-addressed rather than node-addressed. What survives
 * here is the rendered SHAPE, still consumed by
 * `InspectorFieldShell` and therefore by every composition-shell
 * control. `p4-009` should re-home this declaration out of
 * `inspector/` when it deletes the overrides shell.
 */

import type { ResolvedValue } from "@anvilkit/contracts/editor";

/** The authoring families the universal inspector edits in Phase 1A. */
export type InspectorFamily = "layout" | "style" | "typography";

/** One field's computed state across the selection. */
export type InspectorFieldState<T> =
	| {
			readonly kind: "value";
			readonly value: T;
			/** §12.3 provenance of the effective value (source display). */
			readonly resolved: ResolvedValue<T>;
			/** True when the value is written at the active write layer. */
			readonly writtenAtLayer: boolean;
	  }
	| { readonly kind: "mixed" }
	| {
			readonly kind: "unset";
			/** The effective (inherited/default) value, for placeholders. */
			readonly resolved: ResolvedValue<T>;
	  }
	| { readonly kind: "unsupported" };
