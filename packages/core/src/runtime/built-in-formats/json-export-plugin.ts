import type { StudioPlugin } from "@/types/plugin";
import { CORE_VERSION } from "../version.js";
import { jsonFormat } from "./json-format.js";

const JSON_EXPORT_PLUGIN_META = {
	id: "@anvilkit/core/json-export",
	name: "AnvilKit Built-in JSON Export",
	version: CORE_VERSION,
	coreVersion: `^${CORE_VERSION}`,
	description:
		"Built-in JSON snapshot export wired into runtime.exportFormats.",
} as const;

export const jsonExportPlugin: StudioPlugin = {
	meta: JSON_EXPORT_PLUGIN_META,
	register() {
		return {
			meta: JSON_EXPORT_PLUGIN_META,
			exportFormats: [jsonFormat],
		};
	},
};
