/**
 * @file Compatibility re-export shim — export format contract.
 *
 * Canonical ownership moved to `@anvilkit/contracts`
 * (`packages/contracts/src/export.ts`); see the shim rationale in
 * `./ir.ts`. The plugin registration surface that consumes these
 * types (`StudioPluginRegistration.exportFormats`) stays in core.
 * New code should import the contract types from
 * `@anvilkit/contracts` directly.
 */

export type {
	ExportFormatDefinition,
	ExportFormatRunContext,
	ExportOptions,
	ExportResult,
	ExportWarning,
	ExportWarningLevel,
} from "@anvilkit/contracts";
