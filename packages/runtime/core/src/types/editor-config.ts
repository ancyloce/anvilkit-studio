/**
 * @file Host-facing editor configuration types (compat shim).
 *
 * `StudioProps.editor` is typed as `StudioEditorConfig`, which lives on
 * the `@anvilkit/contracts/editor` subpath — but hosts configure Studio
 * through `@anvilkit/core` and do not depend on `@anvilkit/contracts`.
 * Without this shim a host cannot *write* the object it is required to
 * pass: `dataSourceAdapter` and `pageAdapter` are declared in terms of
 * interfaces it has no way to name.
 *
 * This is the same gap CORE-P2-012 found and fixed for
 * `EditorExportCapabilities` (see `./export.ts`) — an exporter could
 * not declare capabilities and typecheck. The adapter surfaces have it
 * too, found while wiring `apps/studio` for the §32.4 E2E.
 *
 * Re-exports only. `@anvilkit/contracts/editor` remains the owner
 * (`docs/architecture` layering rule: contracts owns shared types).
 */

export type {
	DataSchema,
	DataSourceDescriptor,
	EditorDataSourceAdapter,
	EditorPageAdapter,
	EditorPageDescriptor,
	EditorPolicies,
	EditorRenderScope,
	EditorStyleAdapter,
	JsonValue,
	PreviewDataRequest,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
