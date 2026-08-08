# Canonical editor naming map

The authoritative rename/delete map for the canonical Puck-native rewrite. Every versioned identifier in the editor stack has exactly one row here, with its verified declaration site and the task that executes the change.

- **Source of the target model:** `docs/plans/0026-canonical-puck-native-rewrite-plan-0806-0029.md` §2.
- **Execution schedule:** `docs/plans/0028-canonical-puck-native-rewrite-phased-execution-0806-1023.md`; task files under `docs/tasks/`.
- **Decisions that gate rows in this map:** `docs/adr/0007-canonical-editor-decisions.md` — **all seven signed off 2026-08-06**, so every conditional row below is now resolved.
- **Produced by:** `p0-001`. **Verified against the working tree:** 2026-08-06.
- **Mandate:** no `v1`/`v2` vocabulary may remain in the code — no version-suffixed identifiers, no dual-version branches, no version-marker fields, no migration shims in runtime code.

Later phases execute this map mechanically. If a row's cited line has drifted when its task runs, re-verify and update the row — do not guess.

---

## 1. Renamed

| Identifier | Declared at | End state | Task |
|---|---|---|---|
| `AuthorStyleV1` | `packages/foundation/contracts/src/editor/appearance.ts:28` | `AuthorStyle` | `p1-001` |
| `TargetAppearanceV1` | `contracts/src/editor/appearance.ts:35` | `TargetAppearance` | `p1-001` |
| `AnvilAppearanceV1` | `contracts/src/editor/appearance.ts:46` | `AnvilAppearance`; the `version: "1"` member at `:47` is **removed** | `p1-001` |
| `DesignSystemV1` | `contracts/src/editor/design-system.ts:19` | `DesignSystem` | `p1-001` |
| `DocumentComponentLibraryV1` | `contracts/src/editor/design-system.ts:29` | `DocumentComponentLibrary` | `p1-001` |
| `AnvilKitV2RootProps` | `contracts/src/editor/design-system.ts:39` | `AnvilRootProps`; the `authoringSchemaVersion?: 2` member at `:42` is **removed** | `p1-001` |
| `InteractionV1` | `contracts/src/editor/interactions.ts:104` | `Interaction` | `p1-002` |
| `BindingV1` | `contracts/src/editor/bindings.ts:58` | `Binding` | `p1-002` |
| `ComponentDefinitionV1` | `contracts/src/editor/components.ts:87` | `ComponentDefinition` | `p1-002` |
| `StyleDefinitionV1` | `contracts/src/editor/style-definitions.ts:29` | `StyleDefinition` | `p1-002` |
| `TiptapDocumentV1` | `contracts/src/editor/node-state.ts:71` | `TiptapDocument`; also referenced in the inline-text union at `:80` | `p1-002` |
| *file* `component-metadata-v2.ts` | `contracts/src/editor/` | `component-metadata.ts` (use `git mv` so history follows) | `p1-003` |
| `StyleTargetCapabilityV2` | `contracts/src/editor/component-metadata-v2.ts:53` | `StyleTargetCapability` | `p1-003` |
| `AnvilComponentMetadataV2` | `contracts/src/editor/component-metadata-v2.ts:64` | `AnvilComponentMetadata` | `p1-003` |
| `StyleTargetCapabilityV2Schema` | `packages/foundation/schema/src/editor/appearance.ts:96` | `StyleTargetCapabilitySchema` | `p1-003` |
| `ComponentMetadataV2Schema` | `schema/src/editor/appearance.ts:121` | `ComponentMetadataSchema`; the `version: z.literal("2")` at `:123` is **removed** | `p1-003` |
| `readEditorMetadataV2` | `packages/runtime/core/src/puck/component-metadata.ts:32` | `readEditorMetadata` — the **only** metadata reader | `p1-003` |
| `EditorSelectionState.scope` | `contracts/src/editor/commands.ts:478` (field at `:482`) | `definitionScope`. The type is re-homed to `contracts/src/editor/selection.ts` so `commands.ts` can be deleted, then the field is renamed | re-homed `p1-005`, renamed `p3-007` |
| `COMPONENT_INSTANCE_PROP` value `"__anvilkitInstance"` | `packages/runtime/core/src/editor/components/materialize.ts:55` | `"anvilComponentInstance"` | code `p3-003`, stored data `p7-002` |

## 2. Deleted

| Identifier | Declared at | Task |
|---|---|---|
| `ANVILKIT_AUTHORING_KEY` (value `"__anvilkit"`) | `contracts/src/editor/authoring-state.ts:28` | `p1-005` |
| `AuthoringStateV1` | `contracts/src/editor/authoring-state.ts:40` | `p1-005` |
| `AnvilKitRootProps` — the sidecar width-subtyping carrier `{ __anvilkit?: AuthoringStateV1 }` | `contracts/src/editor/authoring-state.ts:61` | `p1-005` |
| `NodeAuthoringStateV1` | `contracts/src/editor/node-state.ts:33` | `p1-005` |
| `createEmptyAuthoringState` | `packages/foundation/schema/src/editor/authoring-state.ts:69` | `p1-005` |
| `EditorCapabilityMetadata` (the v1 capability declaration) | `contracts/src/editor/capability-metadata.ts:43` | `p2-006` — see finding F-1 |
| `EditorCommandBase` | `contracts/src/editor/commands.ts:49` | `p1-005` |
| `EditorCommand` union + its 31 atomic members + `BatchEditorCommand` | `contracts/src/editor/commands.ts:470` (members `:49-469`) | `p1-005` |
| `EditorCommandResult` | `contracts/src/editor/commands.ts:486` | `p1-005` |
| `EditorCommandSnapshot` | `contracts/src/editor/commands.ts:498` | `p1-005` |
| `V2CommandPlan` | `packages/runtime/core/src/puck/command-bridge.ts:55` | `p3-009` |
| `planV2Command` | `core/src/puck/command-bridge.ts:141` | `p3-009` |
| `applyV2Plan` | `core/src/puck/command-bridge.ts:335` | `p3-009` |
| `migrateToPuckNativeV2` | `core/src/migrations/puck-native-v2.ts:261` | `p7-004` |
| `guardDocumentForV2Editor` | `apps/studio/lib/migration/v2-guard.ts:40` | `p7-004` |
| `migrate:puck-native-v2` npm script | `apps/studio/package.json:12` | `p7-004` |
| `appearance.version` wire literals | `schema/src/editor/appearance.ts:49`, `:54`, `:64` | code `p1-006`, stored data `p7-002` |

`commands.ts` carries **40 exports** in total (32 of them command-type literals). Deleting it is the change that turns 85 files into compile errors, which is the intended enforcement mechanism (PLAN-0026 §6: "enforced by absence").

## 3. Retained — do not delete

Listed explicitly because three of them sit inside files marked for deletion, and a file-level delete would take them with it.

| Identifier | Declared at | Why retained |
|---|---|---|
| `InlineTextTarget` | `contracts/src/editor/capability-metadata.ts:12` | Live contract for inline-text editing; consumed by `core/src/react/editor/inline/targets.ts:23,33,49` and `inline/controller.ts:31,63`. `ED-FA-012` requires the capability be carried across |
| `ImageTarget` | `contracts/src/editor/capability-metadata.ts:19` | Live contract; consumed by `core/src/react/editor/inspector/sections/image/ImageSection.tsx:21,69`, `inline/image/adjustments.ts`, `core/src/studio/canvas-drop/resolve-target-prop.ts:100` and `resolve-field-path.ts:239`. `ED-FA-011` builds on it |
| `SlotCapability` | `contracts/src/editor/capability-metadata.ts:30` | Part of the **canonical** metadata contract, not the v1 one — imported by `component-metadata-v2.ts:18` and re-exported as `slots` at `:69`, with a schema at `schema/src/editor/appearance.ts:115`. `ED-FA-010` builds on it |
| `AccessibilityOverride`, `TiptapBlockNode`, `InlineTextValue`, `ImageAdjustment` | `contracts/src/editor/node-state.ts:18,55,78,87` | Unversioned, live; they share a file with two identifiers that are deleted/renamed |
| `AuthorStyleSchema`, `TargetAppearanceSchema`, `AnvilAppearanceSchema`, `DesignSystemSchema`, `DocumentComponentLibrarySchema`, `AuthorableStylePropertySchema` | `schema/src/editor/appearance.ts:34,40,47,53,62,69` | Already unversioned in name; **names keep**, wire shapes drop their version literals (`p1-006`) |
| `resolveStyleTargets` | `core/src/puck/component-metadata.ts:120` | Already unversioned; its declaration-order guarantee (`:126-138`) is what `p5-002`'s keyboard traversal depends on |
| `AUTHORABLE_PROPERTY_LOCATIONS` | `core/src/puck/component-metadata.ts:59` | Already unversioned; widened 23 → 40 entries by `p1-004` |

## 4. Conditional

| Identifier | Declared at | Disposition | Task |
|---|---|---|---|
| `EditorCommandPort` | `contracts/src/editor/commands.ts:518` | **Retained as a type-only deprecated alias through P8**, per finding F-2 and ADR 0007 decision 7. Moves to `contracts/src/editor/selection.ts` with `EditorSelectionState` when `commands.ts` is deleted, and is added to the `p0-002` tombstone list with `p8-011` named as its removal task | retained `p1-005`, deleted `p8-011` |
| `editorAnnotations` root prop | not yet declared | Added only if ADR 0007 decision 1 is accepted | `p3-006` |
| `schemaRevision` on `PageRecord` | not yet declared (`apps/studio/lib/page-storage/types.ts:18-30`) | Added only if ADR 0007 decision 2 is accepted | `p7-001` |

## 5. Findings from the verification sweep

Three corrections to PLAN-0026 §2/§3.1, each caught by re-opening the source rather than restating the plan.

**F-1 — `capability-metadata.ts` is not wholly deletable.** PLAN-0026 §3.1 lists `contracts/src/editor/{commands.ts, authoring-state.ts, capability-metadata (v1)}` for deletion. That file declares **four** exports and only one — `EditorCapabilityMetadata` at `:43` — is the v1 capability declaration `p2-006` retires. The other three are live contracts with real consumers (see §3 above), and two of them are the contract foundation for `ED-FA-010` (slots) and `ED-FA-011` (image targets), which DD-0019 §36 describes as "contract-complete capabilities that nothing consumes" and PLAN-0026 §3.8.5 defers rather than deletes. A file-level delete in `p1-005` would remove the contracts for two deferred P0 requirements **and** break the inline-text and image subsystems. The map row is therefore identifier-scoped, not file-scoped.

**F-2 — `EditorCommandPort`'s external-adopter question cannot be closed as "no adopters".** PLAN-0026 §7 row 2 offers a binary: verify as fact that no external adopters exist and delete on the original schedule, or retain a type-only deprecated alias through P8. Evidence gathered 2026-08-06:

- The type **is** in the published surface — exported at `contracts/src/editor/index.ts:86`, and it appears 10 times in `packages/foundation/contracts/api/api-snapshot.json`.
- `@anvilkit/contracts` **is** published publicly: `publishConfig.access: "public"`, not private, exactly one version on the registry (`0.1.18`), `dist-tags.latest = 0.1.18`, last modified 2026-07-09.
- npm reports **179 downloads** of `@anvilkit/contracts` and **173** of `@anvilkit/core` for 2026-07-07 → 2026-08-05.

Download counts cannot distinguish an external adopter from CI, mirrors and registry bots, and those numbers are consistent with either reading. Since "no external adopters exist" is therefore **not verifiable from available evidence**, PLAN-0026's own fallback applies and the alias is retained. This is a determination on the evidence, not a preference — if the owner has out-of-band knowledge of the adopter set, decision 7 in ADR 0007 is where to overrule it.

**F-3 — the `EditorCommand` union is 40 exports, not ~45.** PLAN-0026 §0's audit table estimates "the ~45-export `EditorCommand` union in `contracts/src/editor/commands.ts:49-522`". Verified: `commands.ts` has **40** exported members, of which **32** carry a command `type` literal (31 atomic members plus `BatchEditorCommand`). The file is 523 lines. The estimate was close enough not to change any decision, but the map uses the counted figure.

Two further placement details, not errors but worth stating so `p1-005` does not go looking in the wrong file: `NodeAuthoringStateV1` is declared in `node-state.ts:33`, **not** in `authoring-state.ts` (which imports it at `:18`), and `createEmptyAuthoringState` lives in `@anvilkit/schema` (`schema/src/editor/authoring-state.ts:69`), **not** in contracts. `authoring-state.ts` also declares `AnvilKitRootProps` at `:61`, which PLAN-0026 §2 does not list at all; it is deleted with the file and now has a row.

## 6. Task assignment — four deliberate exceptions

`p0-001`'s acceptance criterion expects every **deleted** row to name a task in P1 or P3 and every **renamed** row to name one in P1. Four rows do not, each for a reason that is a property of the code rather than of the schedule:

| Row | Assigned to | Why not P1/P3 |
|---|---|---|
| `EditorCapabilityMetadata` (deleted) | `p2-006` | Its consumer is the inspector's capability-gating path (`core/src/react/editor/inspector/use-inspector.ts:82-107` via `react/editor/capability-registry.ts:49-78`), which `p2-006` replaces with `resolveStyleTargets`. Deleting the type in P1 would strand that path for a whole phase. `p1-005` temporarily unwires it; `p2-006` deletes it |
| `migrateToPuckNativeV2`, `guardDocumentForV2Editor`, `migrate:puck-native-v2` (deleted) | `p7-004` | The migration layer is what *performs* the finalization. It cannot be deleted before the migration it implements has run |
| `EditorSelectionState.scope` → `definitionScope` (renamed) | re-homed `p1-005`, renamed `p3-007` | The rename lands with the `mode`/`targetId` fields in the same type. Renaming in P1 and adding fields in P3 would touch the type twice for one change |
| `COMPONENT_INSTANCE_PROP` value (renamed) | code `p3-003`, data `p7-002` | It is a **prop key in stored documents**, not just an identifier. The code rename and the data migration are necessarily different phases, with a time-boxed dual read between them |

## 7. Enforcement

`p0-002` builds the banned-identifier gate from the §2 **Deleted** table plus the two string-typed escapes that typecheck-by-absence cannot catch — `__anvilkit` and `authoringSchemaVersion` — because those survive as literals in JSON fixtures, migration code and stored documents. Everything else is enforced by absence: once contracts stops exporting a symbol, any surviving import is a compile error.

The gate carries a **shrink rule**: it fails when a tombstoned identifier has zero hits repo-wide and is still listed, so the list is pruned as each name genuinely dies. At `p8-011` the list should be empty and the gate's own assertion proves it.
