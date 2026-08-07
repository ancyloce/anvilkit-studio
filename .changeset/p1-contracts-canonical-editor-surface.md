---
"@anvilkit/contracts": minor
---

Canonical Puck-native editor contracts: drop the version vocabulary and
delete the sidecar command IR (PLAN-0026 §2, §3.1; PLAN-0028 P1).

**Breaking — types renamed (no aliases).** The `V1`/`V2` suffixes are gone
because the canonical document has no version dimension:

- `AnvilAppearanceV1` → `AnvilAppearance`
- `TargetAppearanceV1` → `TargetAppearance`
- `AuthorStyleV1` → `AuthorStyle`
- `DesignSystemV1` → `DesignSystem`
- `DocumentComponentLibraryV1` → `DocumentComponentLibrary`
- `InteractionV1` → `Interaction`
- `BindingV1` → `Binding`
- `ComponentDefinitionV1` → `ComponentDefinition`
- `StyleDefinitionV1` → `StyleDefinition`
- `TiptapDocumentV1` → `TiptapDocument`
- `AnvilComponentMetadataV2` → `AnvilComponentMetadata`
- `StyleTargetCapabilityV2` → `StyleTargetCapability`
- `AnvilKitV2RootProps` → `AnvilRootProps`, which also **drops
  `authoringSchemaVersion`**

**Breaking — deleted with no successor.** The parallel command IR and the
sidecar's type declarations are removed; `Config` + `Data` + `PuckApi` +
`Render` are the only editor contract:

- The whole `EditorCommand` union and its 37 member interfaces, plus
  `AtomicEditorCommand`, `EditorCommandBase`, `EditorCommandPort`,
  `EditorCommandResult`, `EditorCommandSnapshot`, `EditorPreviewResult`
- `AuthoringStateV1`, `ANVILKIT_AUTHORING_KEY`, `AnvilKitRootProps`
- `EditorCapabilityMetadata` (the v1 capability contract)

`EditorSelectionState` survives, re-homed into a new `editor/selection.ts`.

**Widened.** `AuthorableStyleProperty` grows from 23 to 40 members
(`ED-FA-001`), so authored styles can express the property vocabulary the
inspector offers. The matching Zod enum in `@anvilkit/schema` is widened in
the same release and the two are checked for parity.

Consumers still importing the deleted command vocabulary will not compile —
that is deliberate. There is no compatibility shim, and none is planned.
