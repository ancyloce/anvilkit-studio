import { Buffer } from "node:buffer";
import type { PageIR } from "@anvilkit/core/types";
import {
	type HtmlExportOptions,
	htmlFormat,
} from "@anvilkit/plugin-export-html";
import {
	type ReactExportOptions,
	reactFormat,
} from "@anvilkit/plugin-export-react";

import { CliError } from "./errors.js";

export interface FormatDispatchOptions {
	readonly assetStrategy?: "url-prop" | "inline";
	readonly format: string;
	readonly inlineAssets?: boolean;
	readonly syntax?: "tsx" | "jsx";
}

export interface FormatDispatchResult {
	readonly content: string;
	readonly filename: string;
	readonly warnings: readonly unknown[];
}

export async function dispatchFormat(
	ir: PageIR,
	options: FormatDispatchOptions,
): Promise<FormatDispatchResult> {
	if (options.format === "html") {
		return normalizeExportResult(
			await htmlFormat.run(ir, htmlOptionsFromFlags(options)),
		);
	}

	if (options.format === "react") {
		return normalizeExportResult(
			await reactFormat.run(ir, reactOptionsFromFlags(options)),
		);
	}

	throw new CliError({
		code: "INVALID_FORMAT",
		exitCode: 2,
		message: "--format must be html|react",
	});
}

export function htmlOptionsFromFlags(
	options: Pick<FormatDispatchOptions, "inlineAssets">,
): HtmlExportOptions {
	if (options.inlineAssets === true) {
		return {
			inlineAssetThresholdBytes: Number.POSITIVE_INFINITY,
		};
	}

	return {};
}

export function reactOptionsFromFlags(
	options: Pick<FormatDispatchOptions, "assetStrategy" | "syntax">,
): ReactExportOptions {
	return {
		...(options.syntax !== undefined ? { syntax: options.syntax } : {}),
		...(options.assetStrategy !== undefined
			? ({ assetStrategy: options.assetStrategy } as {
					assetStrategy: "url-prop" | "inline";
				})
			: {}),
	} as ReactExportOptions;
}

function normalizeExportResult(result: {
	readonly content: string | Uint8Array;
	readonly filename: string;
	readonly warnings?: readonly unknown[];
}): FormatDispatchResult {
	return {
		content:
			typeof result.content === "string"
				? result.content
				: Buffer.from(result.content).toString("utf8"),
		filename: result.filename,
		warnings: result.warnings ?? [],
	};
}
