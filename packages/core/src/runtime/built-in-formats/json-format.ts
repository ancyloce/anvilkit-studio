import type { ExportFormatDefinition } from "@/types/export";

export const jsonFormat: ExportFormatDefinition = {
	id: "json",
	label: "JSON",
	extension: "json",
	mimeType: "application/json",
	run: async (ir) => ({
		content: JSON.stringify(ir, null, 2),
		filename: "page.json",
		warnings: [],
	}),
};
