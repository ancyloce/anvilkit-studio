import { DATA_SOURCE_PROP, getDataSourceDirective } from "@anvilkit/ir";
import type { PageRootProps } from "@anvilkit/schema";
import type { Data } from "@puckeditor/core";
import type { DemoComponents } from "./puck-demo";

type DemoData = Data<DemoComponents, PageRootProps>;
export interface Metric {
	label: string;
	value: string;
}

/** Parse a 2-column (`label,value`) CSV into metric rows. Blank lines skipped. */
export function parseCsvMetrics(csv: string): Metric[] {
	return csv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const comma = line.indexOf(",");
			if (comma < 0) return { label: line, value: "" };
			return {
				label: line.slice(0, comma).trim(),
				value: line.slice(comma + 1).trim(),
			};
		});
}

async function fetchCsvMetrics(url: string): Promise<Metric[]> {
	try {
		const res = await fetch(url);
		if (!res.ok) return [];
		return parseCsvMetrics(await res.text());
	} catch {
		return [];
	}
}

/**
 * F11: resolve `remote_csv` dataSource directives into plain props server-side,
 * BEFORE `<Render>`. Each content node carrying a directive (per
 * `@anvilkit/ir`) has its CSV fetched + parsed into a `metrics` prop; the
 * directive is stripped. Components stay fetch-ignorant — they only render the
 * resolved props. The general remote-query layer is out of scope (§8.4).
 */
export async function resolveDataSources(data: DemoData): Promise<DemoData> {
	const content = await Promise.all(
		(data.content ?? []).map(async (node) => {
			const directive = getDataSourceDirective(
				node.props as Record<string, unknown>,
			);
			if (directive === undefined) return node;
			const metrics = await fetchCsvMetrics(directive.url);
			const next = { ...(node.props as Record<string, unknown>), metrics };
			delete next[DATA_SOURCE_PROP];
			return { ...node, props: next };
		}),
	);
	return { ...data, content } as DemoData;
}
