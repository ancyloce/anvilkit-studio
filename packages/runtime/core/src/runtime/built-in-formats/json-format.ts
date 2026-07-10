import type { ExportFormatDefinition } from "@/types/export";

/**
 * The built-in JSON snapshot exporter — the one export format
 * `@anvilkit/core` ships itself (every other format comes from a plugin).
 *
 * `run(ir)` serializes the already-normalized `PageIR` verbatim with
 * `JSON.stringify(ir, null, 2)` (2-space indent, human-readable/diffable)
 * and returns it as a `string` under the fixed filename `page.json` with
 * the `application/json` MIME type. It performs no asset rewriting and
 * emits no warnings — the IR is reproduced as-is, so it round-trips losslessly
 * back through the IR pipeline.
 *
 * Registered with the runtime by `jsonExportPlugin`, so it is always
 * available even when a host installs no exporter plugins.
 */
export const jsonFormat: ExportFormatDefinition = {
	id: "json",
	label: "JSON",
	extension: "json",
	mimeType: "application/json",
	run: async (ir) => ({
		content: JSON.stringify(ir, null, 2),
		filename: "page.json",
		warnings: [],
	}),
};
