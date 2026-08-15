import { createBadgeConfig } from "@anvilkit/badge";
import { createButtonConfig } from "@anvilkit/button";
import { createCardConfig } from "@anvilkit/card";
import { withBindingResolution } from "@anvilkit/core/editor";
import { createInputConfig } from "@anvilkit/input";
import { createSelectConfig } from "@anvilkit/select";
import { createSeparatorConfig } from "@anvilkit/separator";
import type { Config, Fields } from "@puckeditor/core";

/**
 * THE config assembly for the component editor (design 0022 §1.3).
 *
 * One object, wrapped exactly once by `withBindingResolution`
 * (`packages/runtime/core/src/puck/resolve-bindings.ts:100`; wrapping is
 * idempotent), flows to all four consumers — editor, preview, publish and
 * export — which is the Unified Puck Contract's "one pipeline, four
 * consumers" rule. Component type names are the plain base names; the AI
 * whitelist enum derives from `Object.keys(config.components)` (design
 * §6.1), so nothing else needs to list them.
 */

export interface EditorRootProps {
	title: string;
	slug: string;
	description: string;
	/**
	 * `status` and `version` carry no visible field (design §1.3 lists only
	 * title/slug/description) but must be present: the storage layer
	 * validates every document against the canonical `PageRootSchema`
	 * (`@anvilkit/schema`), which requires them. `parentFolder` and `seo`
	 * are omitted deliberately — the schema defaults both.
	 */
	status: "draft" | "published" | "archived";
	version: string;
}

/**
 * Root fields per design §1.3. SEO deliberately stays with the page-seo
 * plugin rather than being duplicated here (the studio precedent).
 */
const editorRootFields = {
	title: { type: "text", label: "Title" },
	slug: { type: "text", label: "Slug" },
	description: { type: "textarea", label: "Description" },
} as Fields<EditorRootProps>;

const editorRootProps: EditorRootProps = {
	title: "Untitled",
	slug: "untitled",
	description: "",
	status: "draft",
	version: "1",
};

export function createComponentEditorConfig(locale?: string): Config {
	const options = locale === undefined ? undefined : { locale };

	return withBindingResolution({
		categories: {
			inputs: {
				title: "Inputs",
				components: ["Button", "Input", "Select"],
			},
			display: {
				title: "Display",
				components: ["Badge", "Card", "Separator"],
			},
		},
		components: {
			Badge: createBadgeConfig(options),
			Button: createButtonConfig(options),
			Card: createCardConfig(options),
			Input: createInputConfig(options),
			Select: createSelectConfig(options),
			Separator: createSeparatorConfig(options),
		},
		root: {
			fields: editorRootFields,
			defaultProps: editorRootProps,
		},
	} as unknown as Config);
}

/** Static English config — the default for non-localized consumers. */
export const componentEditorConfig: Config = createComponentEditorConfig();
