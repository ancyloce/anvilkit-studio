/**
 * @file `dataSource` directive (PRD 0004 F11).
 *
 * A node may carry a data-source directive under the reserved
 * {@link DATA_SOURCE_PROP} prop key. It is a plain serializable object, so it
 * survives `puckDataToIR` → `irToPuckData` losslessly (canonicalization keeps
 * serializable props). A server-side adapter reads the directive, executes the
 * remote query, and injects the synthesized data as standard props **before**
 * `<Render>` — components never fetch.
 */

/** Reserved prop key carrying a {@link DataSourceDirective} on a node. */
export const DATA_SOURCE_PROP = "_dataSource";

/** Fetch a CSV and synthesize props from it (the only kind shipped — §8.4). */
export interface RemoteCsvDirective {
	readonly kind: "remote_csv";
	readonly url: string;
}

export type DataSourceDirective = RemoteCsvDirective;

/**
 * Read a {@link DataSourceDirective} off a node's props, or `undefined` when
 * absent / malformed. Pure + isomorphic.
 */
export function getDataSourceDirective(
	props: Readonly<Record<string, unknown>> | undefined,
): DataSourceDirective | undefined {
	const raw = props?.[DATA_SOURCE_PROP];
	if (
		raw !== null &&
		typeof raw === "object" &&
		(raw as { kind?: unknown }).kind === "remote_csv" &&
		typeof (raw as { url?: unknown }).url === "string"
	) {
		return { kind: "remote_csv", url: (raw as { url: string }).url };
	}
	return undefined;
}
