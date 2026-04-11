/**
 * @file Public barrel for `@anvilkit/ir`.
 *
 * The IR package is the single source of truth for turning Puck
 * `Data` into a normalized {@link PageIR} document, and for round-
 * tripping it back. Every Anvilkit export format (HTML today,
 * React/JSON/MDX later) consumes IR — never raw Puck `Data` — so
 * this barrel is the entry point every downstream package pins
 * against.
 *
 * The four exports below are intentionally minimal: they are
 * declared and re-exported here in `phase3-002` as throwing stubs
 * so downstream tasks (`phase3-003`, `phase3-004`) can depend on
 * the public shape without waiting for implementations.
 *
 * @see {@link file://./../../../docs/tasks/phase3-002-ir-scaffold.md | phase3-002}
 */

export { collectAssets } from "./collect-assets.js";
export { identifySlots } from "./identify-slots.js";
export { irToPuckData } from "./ir-to-puck-data.js";
export { puckDataToIR } from "./puck-data-to-ir.js";
