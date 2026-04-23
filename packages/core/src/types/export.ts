/**
 * @file Export format contract — the shape every exporter plugin
 * (HTML, React, JSON, …) registers with the Studio runtime.
 *
 * ### Why `run(ir, options)` and not `run(data, options)`?
 *
 * All exports normalize through {@link PageIR} first. This invariant
 * is enforced at the **type** level here — {@link
 * ExportFormatDefinition.run} accepts a `PageIR`, not a Puck `Data`.
 * Authors of new exporters cannot accidentally skip IR normalization;
 * they physically cannot type-check a function that takes `Data`.
 *
 * The normalization step (Puck `Data` → `PageIR`) lives in
 * `@anvilkit/ir` (Phase 3) and is called once by the export pipeline
 * before any registered format runs.
 *
 * ### Design rules
 *
 * 1. **Types only.** This file has zero runtime code.
 * 2. **Generic options.** {@link ExportOptions} is an identity type
 *    with a `Record<string, unknown>` constraint, so format authors
 *    can declare a strongly-typed option bag while the runtime
 *    treats all formats uniformly.
 * 3. **Unicode or bytes.** {@link ExportResult.content} is
 *    `string | Uint8Array` so text formats (HTML, JSON, Markdown)
 *    stay strings and binary formats (PDF, ZIP) stay bytes — no
 *    base64 round-tripping.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-006-types-domain.md | core-006}
 */

import type { IRAssetResolver } from "./asset-resolver.js";
import type { PageIR } from "./ir.js";

/**
 * Severity of a warning produced during an export run.
 *
 * - `"info"` — advisory; nothing wrong, just worth noting.
 * - `"warn"` — non-fatal concern (e.g. missing alt text, unused
 *   prop).
 * - `"error"` — the export succeeded but emitted output the user
 *   should almost certainly fix (e.g. unresolved asset url). An
 *   exporter that cannot produce output at all should `throw` with
 *   a `StudioExportError`, not return an `"error"` warning.
 */
export type ExportWarningLevel = "info" | "warn" | "error";

/**
 * A single diagnostic emitted by an exporter.
 *
 * Warnings are advisory — they do not abort the export. Host apps
 * typically surface them in a toast or a dev console. Hard failures
 * should throw `StudioExportError` (see `core-008`), not return a
 * warning with `level: "error"`.
 */
export interface ExportWarning {
	/**
	 * Severity of this warning. See {@link ExportWarningLevel}.
	 */
	readonly level: ExportWarningLevel;
	/**
	 * Machine-readable warning code (e.g. `"missing-alt-text"`).
	 *
	 * Stable across releases so host apps can filter or localize.
	 * Codes are plugin-defined; Core does not maintain a registry.
	 */
	readonly code: string;
	/**
	 * Human-readable warning message suitable for developer-facing
	 * surfaces (dev console, toast, logs).
	 */
	readonly message: string;
	/**
	 * Optional {@link PageIRNode.id} the warning is attached to.
	 *
	 * When present, host UIs may highlight the offending node in the
	 * editor.
	 */
	readonly nodeId?: string;
}

/**
 * Generic bag of format-specific options passed to
 * {@link ExportFormatDefinition.run}.
 *
 * Declared as a constrained identity type rather than a bare
 * `Record<string, unknown>` so format authors can parameterize their
 * own `run()` signature with a strongly-typed option shape while the
 * runtime's dispatch layer treats every format's options uniformly.
 *
 * @example
 * ```ts
 * interface HtmlExportOptions extends Record<string, unknown> {
 *   readonly inlineStyles: boolean;
 *   readonly minify?: boolean;
 * }
 *
 * const htmlFormat: ExportFormatDefinition<HtmlExportOptions> = {
 *   id: "html",
 *   label: "HTML",
 *   extension: "html",
 *   mimeType: "text/html",
 *   async run(ir, options) {
 *     //        ^? options: ExportOptions<HtmlExportOptions>
 *     //        ^? options.inlineStyles is typed as boolean
 *     return { content: "<!doctype html>…", filename: "page.html" };
 *   },
 * };
 * ```
 *
 * @typeParam T - Format-specific option shape. Defaults to an
 * unconstrained `Record<string, unknown>` so formats that don't care
 * about options can omit the type parameter entirely.
 */
export type ExportOptions<
	T extends Record<string, unknown> = Record<string, unknown>,
> = T;

export interface ExportFormatRunContext {
	readonly assetResolvers?: readonly IRAssetResolver[];
}

/**
 * The return value of a successful {@link ExportFormatDefinition.run}
 * call.
 *
 * Text formats (HTML, JSON, Markdown, React source) should set
 * {@link content} to a `string`. Binary formats (PDF, ZIP, images)
 * should set it to a `Uint8Array`. Host apps dispatch on the type at
 * download time — a `string` becomes a `Blob` with the format's
 * `mimeType`, a `Uint8Array` becomes a `Blob` wrapping the raw bytes.
 */
export interface ExportResult {
	/**
	 * The serialized output.
	 *
	 * Use `string` for text formats and `Uint8Array` for binary
	 * formats. Do not base64-encode binary content into a string;
	 * host apps handle the two cases differently.
	 */
	readonly content: string | Uint8Array;
	/**
	 * The suggested filename for the download, including the
	 * extension (e.g. `"page.html"`, `"page.pdf"`).
	 *
	 * Host apps may override this at the download step, but the
	 * exporter is expected to provide a sensible default.
	 */
	readonly filename: string;
	/**
	 * Optional non-fatal diagnostics emitted during the export run.
	 *
	 * See {@link ExportWarning}. Host apps may surface these in a
	 * dev console or toast; the export itself is still considered
	 * successful.
	 */
	readonly warnings?: readonly ExportWarning[];
}

/**
 * The descriptor every exporter plugin contributes to Studio.
 *
 * Registered via {@link
 * import("./plugin.js").StudioPluginRegistration.exportFormats}.
 * The runtime collects every registered definition into the export
 * registry (`core-009`) and dispatches to the matching `id` when the
 * host calls `exportAs(formatId, options)`.
 *
 * ### `run(ir, options, ctx?)` contract
 *
 * The `run` callback receives a fully-normalized {@link PageIR}, not
 * a Puck `Data`. The IR normalization step (Puck `Data` → `PageIR`)
 * is performed exactly once by the export pipeline before any format
 * runs, ensuring every exporter sees the same input regardless of
 * how the page was authored.
 *
 * Format authors should treat the `ir` argument as deeply read-only.
 * Mutating it has no effect on the runtime and may break other
 * exporters in the same pipeline.
 *
 * @typeParam Opts - Optional format-specific option shape. See
 * {@link ExportOptions} for an example of how to parameterize a
 * concrete format. Defaults to an unconstrained
 * `Record<string, unknown>`.
 */
export interface ExportFormatDefinition<
	Opts extends Record<string, unknown> = Record<string, unknown>,
> {
	/**
	 * Stable, globally-unique format identifier (e.g. `"html"`,
	 * `"react"`, `"json"`).
	 *
	 * The runtime rejects duplicate ids at `createExportRegistry()`
	 * time. Convention: lowercase, hyphen-separated, no namespace
	 * prefix — host apps refer to formats by id in their UI.
	 */
	readonly id: string;
	/**
	 * Human-readable label surfaced in export menus and dialogs
	 * (e.g. `"HTML"`, `"React source"`, `"JSON snapshot"`).
	 */
	readonly label: string;
	/**
	 * File extension (without the leading dot) for downloads in this
	 * format (e.g. `"html"`, `"jsx"`, `"json"`, `"pdf"`).
	 */
	readonly extension: string;
	/**
	 * MIME type for the exported content (e.g. `"text/html"`,
	 * `"application/json"`, `"application/pdf"`).
	 *
	 * Used by host apps to set the correct `Blob` type at download
	 * time and to populate the `Content-Type` header when sending
	 * exports over the network.
	 */
	readonly mimeType: string;
	/**
	 * Produce the serialized output for a page.
	 *
	 * Receives a normalized {@link PageIR} and a format-specific
	 * {@link ExportOptions} bag. Returns a `Promise<ExportResult>`
	 * — always async so the contract is uniform regardless of
	 * whether a given format happens to run synchronously.
	 *
	 * @param ir - The normalized page IR. Deeply read-only.
	 * @param options - Format-specific option bag.
	 * @param ctx - Optional runtime context for additive export hooks.
	 */
	readonly run: (
		ir: PageIR,
		options: ExportOptions<Opts>,
		ctx?: ExportFormatRunContext,
	) => Promise<ExportResult>;
}
