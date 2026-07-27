/**
 * @file Compatibility re-export shim — export format contract.
 *
 * Canonical ownership moved to `@anvilkit/contracts`
 * (`packages/foundation/contracts/src/export.ts`); see the shim rationale in
 * `./ir.ts`. The plugin registration surface that consumes these
 * types (`StudioPluginRegistration.exportFormats`) stays in core.
 * New code should import the contract types from
 * `@anvilkit/contracts` directly.
 */

/**
 * `ExportFormatDefinition.editorCapabilities` is typed against this
 * (DD-0019 §23.2, added by CORE-P0-004), but the type lives on the
 * `@anvilkit/contracts/editor` subpath while the format type lives on
 * the contracts root. Exporters reach the format type through
 * `@anvilkit/core/types`, so its companion has to be reachable from
 * the same entry — otherwise an exporter cannot declare capabilities
 * without typechecking against a subpath it has no dependency on.
 */
export type { EditorExportCapabilities } from "@anvilkit/contracts/editor";

export type {
	ExportFormatDefinition,
	ExportFormatRunContext,
	ExportOptions,
	ExportResult,
	ExportWarning,
	ExportWarningLevel,
} from "@anvilkit/contracts";
