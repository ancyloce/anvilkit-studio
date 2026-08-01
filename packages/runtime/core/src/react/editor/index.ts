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
export type { AccessibilityIssue } from "./a11y/contract-rules.js";
export {
	type AccessibilityIssuesApi,
	useAccessibilityIssues,
} from "./a11y/use-accessibility-issues.js";
export {
	AiProposalReviewMount,
	type AiProposalReviewMountProps,
	type EditorProposalInputs,
	useEditorProposalInputs,
} from "./ai/AiProposalReviewMount.js";
export {
	AuthoringStyleContext,
	type AuthoringStyleLookup,
} from "./authoring-style-context.js";
export type { CanvasDomRegistry } from "./canvas/dom-registry.js";
export { ComponentCanvasPanel } from "./components/ComponentCanvasPanel.js";
export {
	componentScope,
	createEditorScopeController,
	type EditorScopeController,
	scopedDefinitionId,
	scopeGuardError,
} from "./components/scope.js";
export {
	type ComponentCanvas,
	type ComponentCombination,
	useComponentCanvas,
} from "./components/use-component-canvas.js";
export {
	type CreateComponentAction,
	type CreateComponentOutcome,
	useCreateComponent,
} from "./components/use-create-component.js";
export {
	type DecoratePuckConfigOptions,
	decoratePuckConfig,
} from "./decorate-config.js";
export {
	EditorSurfaceSlot,
	type EditorSurfaceSlotProps,
} from "./EditorSurfaceSlot.js";
// Hosts render `EditorError`s themselves (Core ships no diagnostics UI),
// so the code → catalog-key mapping is part of the public surface, not
// an internal detail of Core's own dialogs.
export {
	EDITOR_ERROR_MESSAGE_KEYS,
	editorErrorMessageKey,
} from "./error-messages.js";
// Export preflight (CORE-P3-009) + the §23.2 accessibility export policy
// (CORE-P4-008). Previously unexported, which made
// `EditorPolicies.exportBlockingSeverity` unreachable for every host.
export {
	toPreflightA11yIssues,
	type UseExportPreflightInput,
	useExportPreflight,
} from "./export-preflight.js";
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
export {
	StudioEditorMount,
	type StudioEditorMountProps,
} from "./StudioEditorMount.js";
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
