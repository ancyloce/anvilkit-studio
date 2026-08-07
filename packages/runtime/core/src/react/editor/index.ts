/**
 * @file Barrel for `@anvilkit/core/react/editor` — React and Puck
 * authoring integration (DD-0019 §22.2; PLAN-0020
 * CORE-P0-011/-012, CORE-P1A-001).
 *
 * Surface: the flag-gated lazy mount (`StudioEditorMount`), the
 * composition editor pieces, and the `useStudioEditor` hook family
 * over the typed command port. Config decoration and the authoring
 * boundary/context were deleted in PLAN-0025 P6-01. The selection and viewport
 * controllers land with later Phase 1A tasks (EP-03).
 *
 * `EditorRoot` is deliberately NOT re-exported: it is the code-split
 * boundary and must only be reached through the dynamic import in
 * `StudioEditorMount`. The bridge and the raw port factory are
 * internal wiring — the public read/write handle is
 * `useStudioEditor()`.
 */

export {
	appearanceField,
	bindingsField,
	interactionsField,
} from "../../puck/fields/authoring-fields.js";
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
export type { CanvasDomRegistry } from "./canvas/dom-registry.js";
export { ComponentCanvasPanel } from "./components/ComponentCanvasPanel.js";
export { ComponentInstanceSection } from "./components/ComponentInstanceSection.js";
export { ComponentsPanel } from "./components/ComponentsPanel.js";
export { CreateComponentDialog } from "./components/CreateComponentDialog.js";
export {
	componentScope,
	createEditorScopeController,
	type EditorScopeController,
	getEditorScopeController,
	scopedDefinitionId,
	scopeGuardError,
} from "./components/scope.js";
export {
	type ComponentCanvas,
	type ComponentCombination,
	useComponentCanvas,
} from "./components/use-component-canvas.js";
export {
	type ComponentInstanceModel,
	type InstanceOverrideEntry,
	useComponentInstance,
} from "./components/use-component-instance.js";
export {
	type ComponentLibrary,
	type ComponentLibraryEntry,
	type DeleteDefinitionOutcome,
	useComponentLibrary,
} from "./components/use-component-library.js";
export {
	type CreateComponentAction,
	type CreateComponentOutcome,
	useCreateComponent,
} from "./components/use-create-component.js";
export {
	MAX_EXPRESSIBLE_COMBINATIONS,
	useVariantAuthoring,
	type VariantAuthoring,
	type VariantEditOutcome,
} from "./components/use-variant-authoring.js";
export { VariantAxisEditor } from "./components/VariantAxisEditor.js";
export {
	AppearanceIframeOverride,
	type AppearanceIframeOverrideProps,
} from "./composition/AppearanceIframeOverride.js";
export { CompiledAppearanceMount } from "./composition/CompiledAppearanceMount.js";
export {
	type StudioInspectorPanel,
	StudioPuckLayout,
	type StudioPuckLayoutProps,
} from "./composition/StudioPuckLayout.js";
export { StylePanel } from "./composition/StylePanel.js";
export {
	type AppearanceCommitInput,
	useAppearanceCommit,
} from "./composition/use-appearance-commit.js";
export {
	type UseCompiledAppearanceOptions,
	useCompiledAppearance,
} from "./composition/use-compiled-appearance.js";
export {
	createEditorApi,
	type EditorApiDeps,
	resolveEditorIntent,
} from "./editor-api.js";
export { useAnnotationCommit } from "./composition/use-annotation-commit.js";
export {
	useBindingsCommit,
	useInlineTextCommit,
	useInteractionsCommit,
} from "./composition/use-carrier-commits.js";
export { useComponentLibraryCommit } from "./composition/use-component-library-commit.js";
export { useDesignSystemCommit } from "./composition/use-design-system-commit.js";
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
export {
	PuckIframeAppearanceBridge,
	type PuckIframeAppearanceBridgeProps,
} from "./PuckIframeAppearanceBridge.js";
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
export { DesignSystemPanel } from "./tokens/DesignSystemPanel.js";
export {
	type DesignSystemModel,
	type DesignSystemOutcome,
	type DesignSystemStyle,
	type DesignSystemToken,
	type TokenDeletionPreview,
	useDesignSystem,
} from "./tokens/use-design-system.js";
export {
	useDocumentModel,
	useNodeField,
} from "./use-document-model.js";
export { useResolvedNodeStyle } from "./use-resolved-node-style.js";
export {
	type StudioEditorHandle,
	useOptionalStudioEditor,
	useStudioEditor,
} from "./use-studio-editor.js";
