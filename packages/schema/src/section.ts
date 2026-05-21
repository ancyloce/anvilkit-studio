/**
 * @file `@anvilkit/schema/section` — section-level AI context derivation.
 *
 * The Phase 3 sibling `configToAiContext()` derives a whole-page LLM
 * prompt context. `configToAiSectionContext()` derives the *subtree*
 * variant: given a Puck `Config` and an editor selection, produce the
 * narrowed list of components that may legally replace the selection,
 * forwarding zone metadata and current-subtree snapshots so the prompt
 * builder can ask the LLM to "rewrite THIS hero".
 *
 * Pure function — no React import, no I/O. The output is JSON-
 * serializable end-to-end so plugins can ship it through any IPC
 * boundary they like.
 */

import type {
	AiSectionContext,
	AiSectionSelection,
	ConfigToAiSectionContextOptions,
} from "@anvilkit/core/types";
import type { Config } from "@puckeditor/core";

import { configToAiContext } from "./config-to-ai-context.js";

/**
 * Derive an {@link AiSectionContext} from a Puck `Config` plus the
 * editor's current selection.
 *
 * Resolves the available-components list in three steps:
 *
 * 1. Build the full context via {@link configToAiContext} so each
 *    component has the same shape it would have in a page-level call.
 * 2. If `selection.allow` is present, narrow to that allow-list (root
 *    zone selections typically omit it; slot-bearing selections carry
 *    it from the parent component's slot field).
 * 3. If `selection.disallow` is present, subtract its entries.
 *
 * The result is a plain object suitable for `JSON.stringify` — every
 * field on {@link AiSectionContext} is either a primitive, an array of
 * primitives, or another already-serializable
 * {@link import("@anvilkit/core/types").AiComponentSchema}.
 *
 * @param config - The Puck config defining the registered components.
 * @param selection - The author's current selection. Must reference at
 *   least one node ID; an empty `nodeIds` array throws because the
 *   page-level flow is the right tool for "no selection" cases.
 * @param opts - Optional environment hints (theme, locale, allowResize).
 * @throws Error when `selection.nodeIds` is empty, or when
 *   `selection.allow` references a component not registered in `config`.
 */
export function configToAiSectionContext<C extends Config>(
	config: C,
	selection: AiSectionSelection,
	opts?: ConfigToAiSectionContextOptions,
): AiSectionContext {
	if (selection.nodeIds.length === 0) {
		throw new Error(
			"[@anvilkit/schema] configToAiSectionContext: selection.nodeIds must contain at least one id; use the page-level configToAiContext() for empty selections.",
		);
	}

	const registered = new Set(Object.keys(config.components ?? {}));

	if (selection.allow) {
		const missing = selection.allow.filter((name) => !registered.has(name));
		if (missing.length > 0) {
			throw new Error(
				`[@anvilkit/schema] configToAiSectionContext: selection.allow references components not present in config: ${missing.join(", ")}`,
			);
		}
	}

	const baseContext = selection.allow
		? configToAiContext(config, { include: [...selection.allow] })
		: configToAiContext(config);

	const disallowSet = selection.disallow
		? new Set(selection.disallow)
		: undefined;

	const availableComponents = disallowSet
		? baseContext.availableComponents.filter(
				(component) => !disallowSet.has(component.componentName),
			)
		: baseContext.availableComponents;

	const result: {
		zoneId: string;
		zoneKind?: "slot" | "zone";
		nodeIds: readonly string[];
		availableComponents: typeof availableComponents;
		currentNodes?: AiSectionSelection["currentNodes"];
		allowResize: boolean;
		theme?: "light" | "dark";
		locale?: string;
	} = {
		zoneId: selection.zoneId,
		nodeIds: [...selection.nodeIds],
		availableComponents,
		allowResize: opts?.allowResize === true,
	};

	if (selection.zoneKind !== undefined) {
		result.zoneKind = selection.zoneKind;
	}

	if (selection.currentNodes !== undefined) {
		result.currentNodes = selection.currentNodes;
	}

	if (opts?.theme !== undefined) {
		result.theme = opts.theme;
	}

	if (opts?.locale !== undefined) {
		result.locale = opts.locale;
	}

	return result;
}
