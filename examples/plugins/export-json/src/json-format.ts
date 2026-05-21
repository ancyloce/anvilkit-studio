import type {
	ExportFormatDefinition,
	PageIR,
	PageIRMetadata,
} from "@anvilkit/core/types";

import type { JsonExportOptions } from "./types.js";

function stripTimestamps(metadata: PageIRMetadata): PageIRMetadata {
	const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = metadata;
	return rest;
}

function prepareForSerialization(ir: PageIR, stripTs: boolean): PageIR {
	if (!stripTs) return ir;
	return {
		...ir,
		metadata: stripTimestamps(ir.metadata),
	};
}

/**
 * `ExportFormatDefinition` that serializes a `PageIR` as a JSON
 * document.
 *
 * This is the canonical worked example for the export-pipeline guide:
 * a handful of lines of real code, strongly typed against the Core
 * contract, round-trip-safe because the IR is already JSON-compatible
 * by construction.
 */
export const jsonFormat: ExportFormatDefinition<JsonExportOptions> = {
	id: "json",
	label: "JSON",
	extension: "json",
	mimeType: "application/json",
	async run(ir, options) {
		const indent = options.indent ?? 2;
		const filename = options.filename ?? "page.json";
		const stripTs = options.stripTimestamps ?? false;
		const payload = prepareForSerialization(ir, stripTs);
		const content = JSON.stringify(payload, null, indent);

		return {
			content,
			filename,
		};
	},
};
