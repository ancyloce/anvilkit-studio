/**
 * @file Collaboration capability declaration (DD-0019 §7.4;
 * DD-DEC-019; frozen by CORE-P0-020 —
 * `docs/architecture/editor-collab-capability-contract-freeze.md`).
 *
 * Authoring features and collab transports are mutually exclusive in
 * v1: under a non-granular encoding the entire sidecar syncs as one
 * last-writer-wins blob, so concurrent authoring edits would silently
 * destroy each other. Detection is declarative and registration-time
 * (never connection-probing): collab plugins declare this capability
 * on `meta.capabilities.collaboration` in their **TypeScript** meta
 * (JSON `meta/config.json` widens the encoding literal to `string`
 * and is deliberately not assignable).
 *
 * When `editor.features.enabled` is true and any registered plugin
 * declares an encoding other than `"granular-authoring"`, Studio
 * keeps preview and native Puck editing fully functional, disables
 * authoring writers, and surfaces a persistent, visible
 * `EDITOR_COLLAB_ENCODING_UNSUPPORTED` diagnostic. Neither system is
 * ever silently disabled.
 */

/** Declared collab document encoding (DD-0019 §7.4, verbatim). */
export interface StudioPluginCollabCapability {
	readonly encoding: "legacy-document" | "native-tree" | "granular-authoring";
}
