import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	DATA_SOURCE_PROP,
	type DataSourceDirective,
	getDataSourceDirective,
} from "../data-source.js";
import { irToPuckData } from "../ir-to-puck-data.js";
import { puckDataToIR } from "../puck-data-to-ir.js";

const config = {
	components: { Statistics: { render: () => null } },
} as unknown as Config;

const directive: DataSourceDirective = {
	kind: "remote_csv",
	url: "https://example.com/metrics.csv",
};

describe("getDataSourceDirective", () => {
	it("reads a valid remote_csv directive", () => {
		expect(getDataSourceDirective({ [DATA_SOURCE_PROP]: directive })).toEqual(
			directive,
		);
	});

	it("ignores absent / malformed directives", () => {
		expect(getDataSourceDirective(undefined)).toBeUndefined();
		expect(getDataSourceDirective({ title: "x" })).toBeUndefined();
		expect(
			getDataSourceDirective({ [DATA_SOURCE_PROP]: { kind: "other" } }),
		).toBeUndefined();
		expect(
			getDataSourceDirective({ [DATA_SOURCE_PROP]: { kind: "remote_csv" } }),
		).toBeUndefined();
	});
});

describe("dataSource directive round-trip (F11)", () => {
	it("survives puckDataToIR → irToPuckData without loss", () => {
		const data = {
			root: { props: {} },
			content: [
				{
					type: "Statistics",
					props: { id: "s1", title: "T", [DATA_SOURCE_PROP]: directive },
				},
			],
			zones: {},
		} as unknown as Data;

		const back = irToPuckData(puckDataToIR(data, config));
		const node = back.content[0];
		expect(getDataSourceDirective(node?.props)).toEqual(directive);
	});
});
