import { createAccordionConfig } from "@anvilkit/accordion";
import { createAlertConfig } from "@anvilkit/alert";
import { createAvatarConfig } from "@anvilkit/avatar";
import { createBadgeConfig } from "@anvilkit/badge";
import { createBlockquoteConfig } from "@anvilkit/blockquote";
import { createButtonConfig } from "@anvilkit/button";
import { createCardConfig } from "@anvilkit/card";
import { createCheckboxConfig } from "@anvilkit/checkbox";
import { createCodeConfig } from "@anvilkit/code";
import { createColumnsConfig } from "@anvilkit/columns";
import { createContainerConfig } from "@anvilkit/container";
import { withBindingResolution } from "@anvilkit/core/editor";
import { createGridConfig } from "@anvilkit/grid";
import { createHeadingConfig } from "@anvilkit/heading";
import { createIconConfig } from "@anvilkit/icon";
import { createImageConfig } from "@anvilkit/image";
import { createInputConfig } from "@anvilkit/input";
import { createLabelConfig } from "@anvilkit/label";
import { createLinkConfig } from "@anvilkit/link";
import { createListConfig } from "@anvilkit/list";
import { createProgressConfig } from "@anvilkit/progress";
import { createRichTextConfig } from "@anvilkit/rich-text";
import { createSelectConfig } from "@anvilkit/select";
import { createSeparatorConfig } from "@anvilkit/separator";
import { createSliderConfig } from "@anvilkit/slider";
import { createSpacerConfig } from "@anvilkit/spacer";
import { createStackConfig } from "@anvilkit/stack";
import { createSwitchConfig } from "@anvilkit/switch";
import { createTableConfig } from "@anvilkit/table";
import { createTabsConfig } from "@anvilkit/tabs";
import { createTextConfig } from "@anvilkit/text";
import { createTextareaConfig } from "@anvilkit/textarea";
import { createTooltipConfig } from "@anvilkit/tooltip";
import { createVideoConfig } from "@anvilkit/video";
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
				components: [
					"Checkbox",
					"Input",
					"Label",
					"Select",
					"Slider",
					"Switch",
					"Textarea",
				],
			},
			actions: {
				title: "Actions",
				components: ["Button", "Link"],
			},
			display: {
				title: "Display",
				components: [
					"Alert",
					"Avatar",
					"Badge",
					"Card",
					"Progress",
					"Separator",
					"Table",
					"Tooltip",
				],
			},
			layout: {
				title: "Layout",
				components: [
					"Accordion",
					"Tabs",
					"Container",
					"Spacer",
					"Stack",
					"Grid",
					"Columns",
				],
			},
			typography: {
				title: "Typography",
				components: [
					"Heading",
					"Text",
					"RichText",
					"Blockquote",
					"Code",
					"List",
				],
			},
			media: {
				title: "Media",
				components: ["Image", "Video", "Icon"],
			},
		},
		components: {
			Accordion: createAccordionConfig(options),
			Alert: createAlertConfig(options),
			Avatar: createAvatarConfig(options),
			Badge: createBadgeConfig(options),
			Blockquote: createBlockquoteConfig(options),
			Button: createButtonConfig(options),
			Card: createCardConfig(options),
			Checkbox: createCheckboxConfig(options),
			Code: createCodeConfig(options),
			Columns: createColumnsConfig(options),
			Container: createContainerConfig(options),
			Grid: createGridConfig(options),
			Heading: createHeadingConfig(options),
			Icon: createIconConfig(options),
			Image: createImageConfig(options),
			Input: createInputConfig(options),
			Label: createLabelConfig(options),
			Link: createLinkConfig(options),
			List: createListConfig(options),
			Progress: createProgressConfig(options),
			RichText: createRichTextConfig(options),
			Select: createSelectConfig(options),
			Separator: createSeparatorConfig(options),
			Slider: createSliderConfig(options),
			Spacer: createSpacerConfig(options),
			Stack: createStackConfig(options),
			Switch: createSwitchConfig(options),
			Table: createTableConfig(options),
			Tabs: createTabsConfig(options),
			Text: createTextConfig(options),
			Textarea: createTextareaConfig(options),
			Tooltip: createTooltipConfig(options),
			Video: createVideoConfig(options),
		},
		root: {
			fields: editorRootFields,
			defaultProps: editorRootProps,
		},
	} as unknown as Config);
}

/** Static English config — the default for non-localized consumers. */
export const componentEditorConfig: Config = createComponentEditorConfig();
