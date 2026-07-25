/**
 * @file Barrel for `@anvilkit/core/react/editor` — React and Puck
 * authoring integration (DD-0019 §22.2; PLAN-0020
 * CORE-P0-011/-012, CORE-P1A-001).
 *
 * Surface: config decoration (`decoratePuckConfig`,
 * `AuthoringBoundary`, the authoring-style context), the flag-gated
 * lazy mount (`StudioEditorMount`), and the `useStudioEditor` hook
 * family over the typed command port. The selection and viewport
 * controllers land with later Phase 1A tasks (EP-03).
 *
 * `EditorRoot` is deliberately NOT re-exported: it is the code-split
 * boundary and must only be reached through the dynamic import in
 * `StudioEditorMount`. The bridge and the raw port factory are
 * internal wiring — the public read/write handle is
 * `useStudioEditor()`.
 */

export {
	AuthoringBoundary,
	type AuthoringBoundaryProps,
} from "./AuthoringBoundary.js";
export {
	AuthoringStyleContext,
	type AuthoringStyleLookup,
} from "./authoring-style-context.js";
export {
	type DecoratePuckConfigOptions,
	decoratePuckConfig,
} from "./decorate-config.js";
export {
	StudioEditorMount,
	type StudioEditorMountProps,
} from "./StudioEditorMount.js";
export type { CanvasDomRegistry } from "./canvas/dom-registry.js";
export type {
	InlineEditController,
	InlineEditSession,
} from "./inline/controller.js";
export {
	sanitizeTiptapDocument,
	TIPTAP_ALLOWED_MARKS,
	TIPTAP_ALLOWED_NODES,
} from "./inline/tiptap-contract.js";
export type { StudioViewportController } from "./responsive/viewport-controller.js";
export type { EditorSelectionController } from "./selection.js";
export {
	EDITOR_SHORTCUT_KEYMAP,
	type EditorShortcutBinding,
} from "./shortcuts/registry.js";
export { useResolvedNodeStyle } from "./use-resolved-node-style.js";
export {
	type StudioEditorHandle,
	useOptionalStudioEditor,
	useStudioEditor,
} from "./use-studio-editor.js";
