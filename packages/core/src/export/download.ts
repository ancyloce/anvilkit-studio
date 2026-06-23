/**
 * @file Browser download helpers for export results (report 0002, P2).
 *
 * The DOM half of the export runner — kept separate from
 * {@link runExport} (which is environment-agnostic) so the run/store/
 * error orchestration stays usable from Node/server/test contexts. These
 * functions touch `document` / `Blob` / `URL`, so they live **outside**
 * `src/runtime/` (the React-free, DOM-global-free layer).
 *
 * Replaces the identical hand-rolled `downloadExportResult` the demo and
 * docs Playground each carried.
 */

import type { ExportResult } from "@/types/export";
import { type RunExportOptions, runExport } from "./run-export.js";

/**
 * Trigger a browser download of exported content via a transient
 * object-URL + anchor click.
 *
 * A `string` is wrapped in a `Blob` with `mimeType`; a `Uint8Array` is
 * downloaded as raw bytes. The object URL is always revoked afterwards.
 * Browser-only — calling this without a DOM throws.
 *
 * @param content - The serialized output (`ExportResult.content`).
 * @param filename - Suggested filename, including extension.
 * @param mimeType - The format's MIME type (`ExportFormatDefinition.mimeType`).
 */
export function downloadExportResult(
	content: string | Uint8Array,
	filename: string,
	mimeType: string,
): void {
	const blobPart =
		typeof content === "string" ? content : new Uint8Array(content);
	const blob = new Blob([blobPart], { type: mimeType });
	const url = URL.createObjectURL(blob);
	try {
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Options for {@link exportAndDownload}: {@link runExport}'s plus a filename override. */
export interface ExportAndDownloadOptions<
	Opts extends Record<string, unknown> = Record<string, unknown>,
> extends RunExportOptions<Opts> {
	/**
	 * Override the download filename. Defaults to the exporter's
	 * suggested {@link ExportResult.filename}.
	 */
	readonly filename?: string;
}

/**
 * Browser convenience: {@link runExport} then download the result. The
 * one-liner a `<Studio onExport>` handler can delegate to.
 *
 * @returns The {@link ExportResult} (so callers can also inspect warnings).
 * @throws {@link StudioExportError} when the format's `run` rejects (no
 * download happens in that case).
 */
export async function exportAndDownload<
	Opts extends Record<string, unknown> = Record<string, unknown>,
>(options: ExportAndDownloadOptions<Opts>): Promise<ExportResult> {
	const result = await runExport(options);
	downloadExportResult(
		result.content,
		options.filename ?? result.filename,
		options.format.mimeType,
	);
	return result;
}
