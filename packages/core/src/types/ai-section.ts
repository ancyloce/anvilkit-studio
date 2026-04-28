/**
 * @file Section-level AI editing contract — the types
 * `@anvilkit/schema/section`, `@anvilkit/validator/section`, and the
 * `regenerateSelection()` flow in `@anvilkit/plugin-ai-copilot` pass
 * between each other when an author asks an LLM to rewrite a selected
 * subtree of an existing page.
 *
 * Section-level AI is the Phase 6 / M9 sibling to Phase 3's whole-page
 * AI flow ({@link AiGenerationContext} in `./ai.ts`). The page-level
 * flow asks the LLM to emit a complete {@link PageIR}; the section-level
 * flow asks it to emit a {@link AiSectionPatch} that atomically replaces
 * just the selected nodes inside one Puck zone.
 *
 * ### Shape of the contract
 *
 * - {@link AiSectionSelection} is the editor's "what did the author
 *   click" payload. The plugin builds it from Puck's selection state +
 *   the surrounding zone metadata, then hands it to
 *   `configToAiSectionContext()`.
 * - {@link AiSectionContext} is the LLM-shaped view of that selection —
 *   the available replacement components (already narrowed to whatever
 *   the zone allows), the current subtree snapshots, and optional
 *   environment hints. `@anvilkit/schema/section` owns the derivation;
 *   Core only owns the destination shape.
 * - {@link AiSectionPatch} is the LLM's response shape. Validation
 *   lives in `@anvilkit/validator/section`; Core only owns the type.
 *
 * ### Design rules
 *
 * 1. **Types only.** No runtime code.
 * 2. **Single-subtree per call.** Phase 6 ships a single contiguous
 *    subtree replacement per call. Batched multi-zone patches are
 *    deliberately out of scope — they would need a new contract and
 *    are reserved for `1.2` (plan §12 Q1).
 * 3. **Round-trip safe with Phase 3 page-level AI.** The
 *    {@link AiSectionContext.availableComponents} reuses the
 *    {@link AiComponentSchema} shape so the validator can apply the
 *    same field-level rules at both granularities without forking.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/plans/phase-6-plan.md | Phase 6 plan §5.1 Section-level AI patch model}
 */

import type { AiComponentSchema } from "./ai.js";
import type { PageIRNode } from "./ir.js";

/**
 * The editor's description of which nodes the author selected before
 * asking for a section-level regeneration.
 *
 * Built by the AI copilot plugin from Puck's selection state plus the
 * surrounding zone metadata. Passed verbatim into
 * `configToAiSectionContext()` to derive an LLM-shaped
 * {@link AiSectionContext}.
 *
 * Selection lives inside a single zone — root, a legacy `data.zones`
 * entry, or a modern slot field. The {@link zoneId} discriminates;
 * {@link allow} / {@link disallow} mirror the parent slot's allow-list
 * if the selection is slot-scoped.
 */
export interface AiSectionSelection {
	/**
	 * The Puck zone identifier containing the selection.
	 *
	 * - For root content: Puck's root zone id (typically `"root-zone"`
	 *   or the empty string, depending on Puck version).
	 * - For legacy `data.zones` entries: the dotted key Puck uses
	 *   (`${parentId}:${zoneName}`).
	 * - For modern slot fields: the slot field's path inside the parent
	 *   component.
	 *
	 * Opaque to {@link AiSectionContext} consumers — only the validator
	 * compares it against incoming {@link AiSectionPatch.zoneId} values.
	 */
	readonly zoneId: string;
	/**
	 * Selected node IDs, in author-visible order.
	 *
	 * Length must be ≥ 1 — selecting zero nodes is the page-level flow,
	 * not the section flow. The order is preserved into
	 * {@link AiSectionPatch.nodeIds} so the validator can match
	 * positions when {@link AiSectionContext.allowResize} is `false`.
	 */
	readonly nodeIds: readonly string[];
	/**
	 * Optional snapshot of the current node subtrees being replaced.
	 *
	 * When provided, `configToAiSectionContext()` forwards this onto
	 * {@link AiSectionContext.currentNodes} so the prompt builder can
	 * include "before" content. Hosts that have already loaded a
	 * `PageIR` have this for free; hosts that drive Puck without a
	 * normalized IR may omit it.
	 */
	readonly currentNodes?: readonly PageIRNode[];
	/**
	 * Optional zone-scoped allow-list, mirroring the
	 * `allow` array on Puck slot field definitions.
	 *
	 * When present, `configToAiSectionContext()` narrows
	 * {@link AiSectionContext.availableComponents} to this set. Absent
	 * means "every registered component is permitted in this zone"
	 * (the root-zone default).
	 */
	readonly allow?: readonly string[];
	/**
	 * Optional zone-scoped disallow-list, mirroring the `disallow` array
	 * on Puck slot field definitions. Applied after {@link allow}.
	 */
	readonly disallow?: readonly string[];
	/**
	 * Optional Puck zone hint — `"slot"` for modern slot fields,
	 * `"zone"` for legacy `data.zones` entries, omitted for the root
	 * zone. Forwarded to {@link AiSectionContext.zoneKind}; the
	 * validator uses it as a sanity check when {@link allow} is empty.
	 */
	readonly zoneKind?: "slot" | "zone";
}

/**
 * Optional environment hints for `configToAiSectionContext()`.
 *
 * Mirrors the per-call hints on {@link AiGenerationContext} (theme,
 * locale) so a host that already builds a page-level context can reuse
 * the same hint object for both flows.
 */
export interface ConfigToAiSectionContextOptions {
	/**
	 * Optional theme hint (`"light"` | `"dark"`) forwarded onto
	 * {@link AiSectionContext.theme}.
	 */
	readonly theme?: "light" | "dark";
	/**
	 * Optional BCP 47 language tag forwarded onto
	 * {@link AiSectionContext.locale}.
	 */
	readonly locale?: string;
	/**
	 * When `true`, the resulting context's {@link AiSectionContext.allowResize}
	 * is set so the LLM (and the validator) accepts a {@link AiSectionPatch}
	 * whose `replacement.length` ≠ {@link AiSectionSelection.nodeIds}.length.
	 *
	 * Defaults to `false` — Phase 6 / M9 ships size-preserving patches
	 * only. Hosts wanting "split this hero into three sections" must opt
	 * in explicitly.
	 */
	readonly allowResize?: boolean;
}

/**
 * The LLM-shaped view of a section-level regeneration request.
 *
 * Produced by `@anvilkit/schema/section`'s `configToAiSectionContext()`
 * from a Puck `Config` + an {@link AiSectionSelection}. Passed into the
 * host-supplied `generateSection(ctx, prompt)` callback and again into
 * `validateAiSectionPatch(patch, ctx)` after the LLM responds.
 *
 * Closed shape: every field is intentional. Hosts must not stuff
 * arbitrary metadata onto this object — open extension is reserved for
 * a Phase 7 major bump.
 */
export interface AiSectionContext {
	/**
	 * The zone the selection lives inside. Forwarded from
	 * {@link AiSectionSelection.zoneId} so the validator can verify
	 * that the LLM's emitted {@link AiSectionPatch.zoneId} matches.
	 */
	readonly zoneId: string;
	/**
	 * Optional Puck zone discriminator — `"slot"`, `"zone"`, or omitted
	 * for the root zone. Forwarded from
	 * {@link AiSectionSelection.zoneKind}.
	 */
	readonly zoneKind?: "slot" | "zone";
	/**
	 * The selected node IDs in author-visible order. Forwarded from
	 * {@link AiSectionSelection.nodeIds}; an emitted patch must
	 * preserve this order (and length, when
	 * {@link allowResize} is `false`).
	 */
	readonly nodeIds: readonly string[];
	/**
	 * The components the LLM may emit inside this zone, already
	 * narrowed by the zone's allow / disallow lists.
	 *
	 * Each entry has the same shape as
	 * {@link AiGenerationContext.availableComponents} so the validator
	 * applies identical field-level rules at section and page
	 * granularity.
	 *
	 * The list is sorted by {@link AiComponentSchema.componentName} for
	 * deterministic prompts.
	 */
	readonly availableComponents: readonly AiComponentSchema[];
	/**
	 * Optional snapshot of the subtrees being replaced. Forwarded from
	 * {@link AiSectionSelection.currentNodes}. Lets the prompt builder
	 * include "rewrite THIS subtree" context.
	 */
	readonly currentNodes?: readonly PageIRNode[];
	/**
	 * Whether a size-changing replacement is permitted. Driven by
	 * {@link ConfigToAiSectionContextOptions.allowResize}; defaults to
	 * `false` so single-subtree-replacement is the safe default.
	 */
	readonly allowResize: boolean;
	/**
	 * Optional theme hint forwarded onto the prompt. Mirrors
	 * {@link AiGenerationContext.theme}.
	 */
	readonly theme?: "light" | "dark";
	/**
	 * Optional BCP 47 locale hint. Mirrors
	 * {@link AiGenerationContext.locale}.
	 */
	readonly locale?: string;
}

/**
 * The LLM's response to a section-level regeneration request.
 *
 * Replaces {@link nodeIds} inside {@link zoneId} with {@link replacement}
 * via `puckApi.dispatch({ type: "setData", data: applyPatch(...) })`,
 * preserving surrounding canvas (selection, sidebar, scroll).
 *
 * Validation lives in `@anvilkit/validator/section`'s
 * `validateAiSectionPatch()`; Core only owns the type.
 */
export interface AiSectionPatch {
	/**
	 * The zone the patch applies to. Must match
	 * {@link AiSectionContext.zoneId} — patches that target a different
	 * zone are rejected with code `PATCH_SHAPE`.
	 */
	readonly zoneId: string;
	/**
	 * The node IDs being replaced. Must equal
	 * {@link AiSectionContext.nodeIds} (same order, same length unless
	 * {@link AiSectionContext.allowResize} is `true`).
	 */
	readonly nodeIds: readonly string[];
	/**
	 * The new subtrees, in the order they should appear in the zone
	 * after the replacement is applied. Each node is fully formed
	 * `PageIRNode` shape — the validator runs the same per-node rules
	 * as `validateAiOutput`, scoped to this subtree only.
	 */
	readonly replacement: readonly PageIRNode[];
}
