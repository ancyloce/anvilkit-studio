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

import type { ExportPreflightResult } from "../editor/export-preflight.js";
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
	/**
	 * Format-specific option bag forwarded to `format.run`. **Defaults to
	 * `{}`** when omitted — so a format whose `Opts` has required fields
	 * must pass them here explicitly (the empty default would otherwise
	 * reach `run` missing those fields).
	 */
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
	 * or toast. A throwing `onWarning` is a host-side reporting bug — it
	 * propagates *after* the export is recorded successful, so it is never
	 * misattributed as an export failure.
	 */
	readonly onWarning?: (warning: ExportWarning) => void;
	/**
	 * Editor-feature preflight verdict (DD-0019 §23.2; PLAN-0020
	 * CORE-P3-009). Computed by the editor layer — see
	 * `react/editor/export-preflight.ts` — and merely *enforced* here.
	 *
	 * The split is a layering requirement, not a preference: the verdict
	 * needs `@anvilkit/ir`'s `listUsedAuthoringFeatures`, which
	 * `src/export/` may not import (`check:no-headless-import`). Passing
	 * the result in keeps this module free of that dependency; the
	 * import above is type-only and erases at build.
	 *
	 * Omitted = no editor features in play (the pre-editor path), which
	 * must keep exporting through any format.
	 */
	readonly preflight?: ExportPreflightResult;
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

	// Preflight first: a blocked export must not run the format at all,
	// because a format that emitted output would leave the author with a
	// file that silently dropped the features they authored (§23.2).
	// Recorded as a failed export so the store reflects the attempt.
	if (options.preflight?.status === "blocked") {
		store?.recordExport(format.id, false);
		const features = options.preflight.errors
			.map((error): unknown => error.details?.feature)
			.filter((feature): feature is string => typeof feature === "string");
		throw new StudioExportError(
			format.id,
			`Export blocked: format "${format.id}" does not support ${
				features.length > 0 ? features.join(", ") : "features used by this document"
			}`,
			{ cause: options.preflight },
		);
	}
	store?.setIsExporting(true);
	let result: ExportResult;
	try {
		const ir = await toIR(data);
		result = await format.run(
			ir,
			(options.options ?? {}) as ExportOptions<Opts>,
			assetResolvers !== undefined ? { assetResolvers } : undefined,
		);
		store?.recordExport(format.id, true);
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
	// Fan warnings out AFTER the run is recorded successful and outside the
	// try/catch — so a throwing host `onWarning` surfaces as itself, never
	// wrapped as (or recorded as) an export failure.
	if (onWarning !== undefined) {
		// A degraded development preview reports through the same
		// ExportWarning channel a format uses, so a host that already
		// renders warnings shows preflight problems with no new wiring.
		for (const error of options.preflight?.status === "warning"
			? options.preflight.errors
			: []) {
			onWarning({
				// Preflight problems are advisory here by construction: a
				// blocked verdict threw above, so anything reaching this
				// point is a development-mode degradation.
				level: "warn",
				code: error.code,
				message: error.message,
			});
		}
		for (const warning of result.warnings ?? []) {
			onWarning(warning);
		}
	}
	return result;
}
