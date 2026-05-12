/**
 * @file Public barrel for `@anvilkit/ir`.
 *
 * The IR package is the single source of truth for turning Puck
 * `Data` into a normalized `PageIR` document (declared in
 * `@anvilkit/core`), and for round-tripping it back. Every
 * Anvilkit export format (HTML today, React/JSON/MDX later)
 * consumes IR — never raw Puck `Data` — so this barrel is the
 * entry point every downstream package pins against.
 *
 * See `docs/tasks/phase3-002-ir-scaffold.md` (phase3-002) for the
 * full scaffold spec.
 */

export { collectAssets } from "./collect-assets.js";
export { identifySlots } from "./identify-slots.js";
export { irToPuckData } from "./ir-to-puck-data.js";
export type { PuckDataToIROptions } from "./puck-data-to-ir.js";
export { puckDataToIR } from "./puck-data-to-ir.js";
