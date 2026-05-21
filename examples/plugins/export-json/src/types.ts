/**
 * Optional knobs accepted by the JSON exporter.
 *
 * Extends `Record<string, unknown>` so it plugs directly into
 * `ExportFormatDefinition<Opts>` without further conversion.
 */
export interface JsonExportOptions extends Record<string, unknown> {
	/**
	 * Indent width passed to `JSON.stringify`. `0` produces compact
	 * output on a single line. Defaults to `2`.
	 */
	readonly indent?: number;
	/**
	 * Override the suggested download filename. Defaults to
	 * `"page.json"`.
	 */
	readonly filename?: string;
	/**
	 * Strip the IR `metadata.createdAt` / `metadata.updatedAt`
	 * timestamps before serializing. Useful when the caller wants
	 * byte-stable snapshots that do not drift with wall-clock time.
	 * Defaults to `false`.
	 */
	readonly stripTimestamps?: boolean;
}
