/**
 * @file `runExport` — the first-party export runner (report 0002,
 * finding P2).
 *
 * Before this existed, every host hand-rolled the same export flow:
 * normalize Puck `Data` → {@link PageIR}, look up the format, call
 * `format.run(ir, options)`, surface warnings, wrap failures, and update
 * the export store (the demo and docs Playground duplicated it verbatim).
 * `runExport` collapses that into one helper so a host's `onExport`
 * handler is a one-liner.
 *
 * ### Why inject `toIR`?
 *
 * The Puck `Data` → {@link PageIR} normalization lives in `@anvilkit/ir`
 * (`puckDataToIR`), which `@anvilkit/core` deliberately does **not**
 * depend on. The transform is injected so core stays free of the IR
 * package while still owning the run/store/error orchestration.
 *
 * ### What it does NOT do
 *
 * No DOM. The Blob download is a separate concern (see
 * {@link downloadExportResult}) so `runExport` stays usable from Node /
 * server / test contexts that have no `document`; compose the two with
 * {@link exportAndDownload} in the browser.
 */

import type { Data as PuckData } from "@puckeditor/core";

import { StudioExportError } from "@/runtime/errors";
import type { ExportStoreApi } from "@/state/index";
import type { IRAssetResolver } from "@/types/asset-resolver";
import type {
	ExportFormatDefinition,
	ExportOptions,
	ExportResult,
	ExportWarning,
} from "@/types/export";
import type { PageIR } from "@/types/ir";

/** Options for {@link runExport}. */
export interface RunExportOptions<
	Opts extends Record<string, unknown> = Record<string, unknown>,
> {
	/**
	 * The resolved export format to run. Typically obtained from the
	 * compiled runtime, e.g. `runtime.exportFormats.get(formatId)`.
	 */
	readonly format: ExportFormatDefinition<Opts>;
	/** The Puck page data to export. Normalized to IR via {@link toIR}. */
	readonly data: PuckData;
	/**
	 * Normalizes Puck `Data` to a {@link PageIR}. Inject
	 * `@anvilkit/ir`'s `puckDataToIR` here (bound to the host's
	 * `Config`); core does not depend on `@anvilkit/ir`. May be async.
	 */
	readonly toIR: (data: PuckData) => PageIR | Promise<PageIR>;
	/** Format-specific option bag forwarded to `format.run`. */
	readonly options?: ExportOptions<Opts>;
	/**
	 * Registration-ordered asset resolvers (e.g.
	 * `runtime.assetResolvers`) passed to the format's run context for
	 * URL rewriting. Omit for "no asset rewriting".
	 */
	readonly assetResolvers?: readonly IRAssetResolver[];
	/**
	 * Optional export store to drive: `setIsExporting(true)` before the
	 * run, `recordExport(id, ok)` after, `setIsExporting(false)` in a
	 * `finally`. Omit for headless/CLI callers with no UI state.
	 */
	readonly exportStore?: ExportStoreApi;
	/**
	 * Called once per warning emitted by the format (the warnings are
	 * also returned on {@link ExportResult.warnings}). Route to a logger
	 * or toast.
	 */
	readonly onWarning?: (warning: ExportWarning) => void;
}

/**
 * Normalize → run → record an export, returning the {@link ExportResult}
 * (no download — see {@link exportAndDownload}).
 *
 * Drives the optional {@link RunExportOptions.exportStore} around the run
 * and wraps any failure in a {@link StudioExportError} (preserving the
 * original via `cause`) — an error the format already threw is rethrown
 * unwrapped. The store's in-flight flag is always cleared, even on
 * failure.
 *
 * @throws {@link StudioExportError} when the format's `run` rejects.
 */
export async function runExport<
	Opts extends Record<string, unknown> = Record<string, unknown>,
>(options: RunExportOptions<Opts>): Promise<ExportResult> {
	const { format, data, toIR, assetResolvers, exportStore, onWarning } =
		options;
	const store = exportStore?.getState();
	store?.setIsExporting(true);
	try {
		const ir = await toIR(data);
		const result = await format.run(
			ir,
			(options.options ?? {}) as ExportOptions<Opts>,
			assetResolvers !== undefined ? { assetResolvers } : undefined,
		);
		if (onWarning !== undefined && result.warnings !== undefined) {
			for (const warning of result.warnings) {
				onWarning(warning);
			}
		}
		store?.recordExport(format.id, true);
		return result;
	} catch (error) {
		store?.recordExport(format.id, false);
		if (error instanceof StudioExportError) {
			throw error;
		}
		const reason = error instanceof Error ? error.message : "non-Error thrown";
		throw new StudioExportError(
			format.id,
			`Export format "${format.id}" failed: ${reason}`,
			{ cause: error },
		);
	} finally {
		store?.setIsExporting(false);
	}
}
