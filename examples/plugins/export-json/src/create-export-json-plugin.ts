import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core/types";

import { jsonFormat } from "./json-format.js";

const META: StudioPluginMeta = {
	id: "anvilkit-example-export-json",
	name: "JSON Export",
	version: "0.1.0",
	coreVersion: "^0.1.0-alpha",
	description:
		"Worked example from the AnvilKit export-pipeline guide — registers a single JSON `ExportFormatDefinition` so host apps can download the normalized PageIR as a `.json` file.",
};

/**
 * Create a `StudioPlugin` that contributes the JSON export format.
 *
 * Every field of the registration is optional except `meta`; this
 * plugin touches only `exportFormats`, which is the minimum surface
 * required to add a new downloadable format to a Studio instance.
 */
export function createExportJsonPlugin(): StudioPlugin {
	return {
		meta: META,
		register(_ctx) {
			return {
				meta: META,
				exportFormats: [jsonFormat],
			};
		},
	};
}
