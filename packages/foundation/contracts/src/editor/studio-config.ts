/**
 * @file Studio editor configuration (DD-0019 §22.1) and the host page
 * adapter (§18).
 *
 * When `StudioProps.editor` is absent or `features.enabled !== true`,
 * current UI, data behavior, lazy boundaries, and Puck integration
 * remain unchanged — no editor module is even imported
 * (CORE-P0-012).
 */

import type { EditorDataSourceAdapter } from "./bindings.js";
import type { EditorPolicies } from "./policies.js";
import type { BreakpointDefinition } from "./responsive.js";
import type { ImportableTokenValue, TokenModeId } from "./tokens.js";

/** Per-capability feature flags (DD-0019 §22.1, verbatim). */
export interface StudioEditorFeatures {
	readonly enabled?: boolean;
	readonly layout?: boolean;
	readonly responsive?: boolean;
	readonly directManipulation?: boolean;
	readonly multiSelect?: boolean;
	readonly components?: boolean;
	readonly variants?: boolean;
	readonly tokens?: boolean;
	readonly styleDefinitions?: boolean;
	readonly interactions?: boolean;
	readonly inlineEditing?: boolean;
	readonly dataBinding?: boolean;
	readonly accessibility?: boolean;
}

/** A host page visible to the editor's page navigator (ED-PAGE-001). */
export interface EditorPageDescriptor {
	readonly id: string;
	readonly name: string;
	readonly parentId?: string;
}

/**
 * Host page adapter (DD-0019 §18, verbatim). Without an adapter,
 * page navigation is hidden. Core never persists page trees and page
 * switches never enter Puck history.
 */
export interface EditorPageAdapter {
	list(): Promise<readonly EditorPageDescriptor[]>;
	open(pageId: string): Promise<void>;
	create?(input: { name: string; parentId?: string }): Promise<string>;
	rename?(pageId: string, name: string): Promise<void>;
}

/** The `StudioProps.editor` configuration (DD-0019 §22.1, verbatim). */
export interface StudioEditorConfig {
	readonly features?: StudioEditorFeatures;
	readonly breakpoints?: readonly BreakpointDefinition[];
	readonly defaultTokenMode?: TokenModeId;
	/**
	 * Theme/brand values the token picker offers for import-as-copy
	 * (ADR 0005 Part 2 §3/§4). Static data — hosts that surface
	 * `@anvilkit/plugin-design-system` theme tokens pass them here
	 * rather than Core importing an extension package, which the
	 * layering rule forbids. Absent = the picker shows document tokens
	 * only.
	 */
	readonly importableTokens?: readonly ImportableTokenValue[];
	readonly pageAdapter?: EditorPageAdapter;
	readonly dataSourceAdapter?: EditorDataSourceAdapter;
	readonly policies?: EditorPolicies;
}
