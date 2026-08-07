/**
 * @file The legacy sidecar + command-IR contracts, moved OUT of the
 * published `@anvilkit/contracts` surface by `p1-005`.
 *
 * WHY THESE MOVED RATHER THAN DIED. PLAN-0026 §3.1 deletes the parallel
 * command IR and the `__anvilkit` sidecar. Their replacements — the
 * `document-model/` read projection and the commit helpers — land in P2
 * and P3, but 66 core files read the sidecar and 75 implement the
 * command engine TODAY. Deleting the contracts in P1 would break core
 * with nothing to move consumers onto.
 *
 * So P1 achieves the part that is achievable now and is what its exit
 * gate actually tests: the PUBLISHED contract no longer carries a
 * parallel IR or a sidecar type. These declarations survive as core
 * internals, used only by the engine that is deleted with them in
 * `p3-009`.
 *
 * NOTHING NEW MAY IMPORT FROM HERE. This module has one direction of
 * travel: smaller, then gone.
 */

export * from "./authoring-state.js";
export * from "./commands.js";
