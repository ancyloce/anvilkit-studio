# Collaboration Capability Contract Freeze (CORE-P0-020)

| Field | Value |
|---|---|
| Status | **Frozen** (2026-07-22) — recorded by CORE-P0-020 (PLAN-0020 v1.2); owner ratification per PLAN-0020 §22 pending |
| Task | CORE-P0-020 — Freeze collaboration capability contract |
| Sources | DD-0019 v1.4 §7.4; DD-DEC-019; PLAN-0020 Section 17 item 6; C-5 |
| Verified against | `packages/runtime/core/src/types/plugin.ts:237` (XOR union), `src/runtime/compile-plugins.ts` (no capabilities read today), `plugin-collab-yjs/src/plugin.ts:126` (META declares no capabilities) |
| Validation | Scratch typecheck (workspace tsc 7.0.2, `--strict`) PASSED 2026-07-22: XOR both-true rejected; JSON-sourced boolean spread assignable without cast; `collaboration` assignable on either branch and alone; JSON-widened `{ encoding: string }` correctly rejected |
| Consumers | CORE-P0-003 (publishes `StudioPluginCollabCapability`), CORE-P1A-013 (gating implementation), CORE-P1A-014 (`plugin-collab-yjs` adoption) |

## 1. Frozen type restructuring

The PLAN-0020 proposed direction is **adopted as frozen**, having passed the
constraint validation above:

```ts
// @anvilkit/contracts/editor (published by CORE-P0-003):
export interface StudioPluginCollabCapability {
  readonly encoding: "legacy-document" | "native-tree" | "granular-authoring";
}

// packages/runtime/core/src/types/plugin.ts (restructured in place):
export type StudioPluginSurfaceCapabilities =
  | { readonly sidebar?: boolean; readonly header?: never }
  | { readonly header?: boolean; readonly sidebar?: never };

export interface StudioPluginRuntimeCapabilities {
  readonly collaboration?: StudioPluginCollabCapability;
}

export type StudioPluginCapabilities =
  StudioPluginSurfaceCapabilities & StudioPluginRuntimeCapabilities;
```

- **XOR preserved.** Intersection distributes over the union, so
  `{ sidebar: true, header: true }` remains rejected; existing doc comments
  about mutual exclusivity move to `StudioPluginSurfaceCapabilities`.
- **`meta/config.json` spread assignability preserved** for the existing
  boolean surface flags (validated). `collaboration` is **declared in
  TypeScript meta only** — the same precedent as `StudioPluginMeta.icon`,
  which JSON cannot hold. A JSON-sourced `{ encoding: string }` widens to
  `string` and is deliberately *not* assignable (validated); this is the
  guard that keeps the encoding union honest rather than a limitation.
- Both new names are exported from the same module as
  `StudioPluginCapabilities` (additive; snapshot-reviewed).
- `StudioPluginCollabCapability` is **owned by `@anvilkit/contracts/editor`**
  (foundation layer); core imports the type (runtime → foundation is the
  allowed direction) and re-exports it from its existing types surface so
  plugin authors need no extra import root.

## 2. Registration validation (where the declaration is read)

`compilePlugins()` (`src/runtime/compile-plugins.ts` — React-free runtime,
invoked at `use-studio-controller.ts:644`) is the single read point. It
collects every registered plugin's `meta.capabilities?.collaboration` into
the compiled runtime output as a new additive field:

```ts
readonly collabCapabilities: ReadonlyArray<{
  readonly pluginName: string;
  readonly capability: StudioPluginCollabCapability;
}>;
```

Compilation performs **no gating itself** — it is a pure, deterministic
projection of declared METAs. Recompiles re-read the same plugin objects
(the runtime re-registers identical plugin instances — see the
`studio_plugin_build_resources_in_register` precedent), so identical inputs
produce an identical (deep-equal) capability list; the list is built fresh
per compile and carries no caches.

## 3. Gating semantics (consumed in Phase 1A by CORE-P1A-013)

Exactly DD §7.4 / DD-DEC-019 (already Resolved-as-spec, item 7):

- Gate condition: `editor.features.enabled === true` AND any entry in
  `collabCapabilities` has `encoding !== "granular-authoring"`.
- Effect: authoring **writers disabled**; preview and native Puck editing
  fully retained; persistent, visible `EDITOR_COLLAB_ENCODING_UNSUPPORTED`
  diagnostic. Neither system is silently disabled.
- `"granular-authoring"` declarations do not trip the gate.
- Detection is declarative and registration-time — never connection-probing —
  so gating is deterministic per compile.

## 4. Duplicate collaboration providers

More than one plugin declaring `collaboration` is **not a compile error**
(transport multiplicity is a host concern). All declarations are collected;
the gate decision is most-conservative-wins (any non-granular declaration
disables writers), and the diagnostic lists **every** declaring plugin
(`details.plugins: string[]`).

## 5. Compatibility and migration

- Every currently published plugin META keeps compiling and registering
  unchanged: all members are optional, the boolean-spread path is validated,
  and `plugin-collab-yjs` currently declares no capabilities at all
  (verified at `plugin.ts:126`).
- Undeclared transports remain undetectable — documented limitation (DD
  §7.4); declaring the capability is mandatory for collab plugins.
- **Migration requirements: none** beyond the scheduled `plugin-collab-yjs`
  adoption (CORE-P1A-014), which adds
  `collaboration: { encoding: "native-tree" }` to its TypeScript META (not
  `meta/config.json`), stated explicitly per the checklist.

## 6. API snapshot impact

- **core**: the types surface snapshot covering `src/types/plugin.ts` changes
  additively (two new exported type names; `StudioPluginCapabilities` shape
  refactored to the equivalent intersection — review expectation: no breaking
  change for any existing valid assignment, per the §1 validation), plus the
  compiled-runtime type gains `collabCapabilities`.
- **contracts**: `StudioPluginCollabCapability` appears in the new `./editor`
  snapshot (CORE-P0-016).
- Review expectation recorded now so the CORE-P0-003 / CORE-P1A-013 snapshot
  diffs are pre-approved in shape: additive names + assignment-equivalent
  refactor only.

PLAN-0020 Section 17 item 6 flips to **Resolved** on this record.
CORE-P1A-013 implements this contract without re-opening the shape;
CORE-P0-003 publishes `StudioPluginCollabCapability` exactly as §1.
