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
import type { JsonValue } from "./values.js";

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

/**
 * Host-supplied roots for render-time binding evaluation.
 *
 * `item` and `index` are absent by design: they are produced by a
 * repeat binding's own expansion, not supplied by the host.
 */
export interface EditorRenderScope {
	readonly data?: JsonValue;
	readonly page?: JsonValue;
}

/**
 * Strict-CSP injection adapter for the authoring stylesheet
 * (DD-0019 §29: "Hosts with strict CSP may provide a nonce or
 * constructable-stylesheet adapter for authoring styles").
 *
 * Core writes authoring CSS into the canvas iframe through a single
 * channel, so a host under `style-src 'nonce-…'` (or one that forbids
 * inline `<style>` entirely) has exactly one seam to override. Absent,
 * Core keeps its default `<style>` element — unchanged behaviour for
 * every host that does not need this.
 *
 * The two members are alternatives, not layers: when {@link adopt} is
 * supplied Core does not create a `<style>` element at all, so
 * {@link nonce} would have nothing to apply to.
 */
export interface EditorStyleAdapter {
	/**
	 * CSP nonce stamped on the `<style>` element Core creates. Applied
	 * to both the `nonce` property and the attribute: the property is
	 * what the browser actually checks, the attribute keeps the element
	 * inspectable.
	 */
	readonly nonce?: string;
	/**
	 * Takes over injection entirely — typically via a constructable
	 * `CSSStyleSheet` pushed onto `document.adoptedStyleSheets`, which
	 * needs no `style-src` allowance at all. Called on every authoring
	 * change with the full stylesheet text; the host owns idempotency
	 * and teardown for the document it was handed.
	 */
	adopt?(doc: Document, cssText: string): void;
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
	/**
	 * The data scope binding expressions read at **render** time
	 * (ED-BIND-002; ADR 0006).
	 *
	 * Deliberately host-supplied rather than fetched by Core. §19 lets
	 * Core store descriptors and expressions but **never preview
	 * responses**, so a render-time cache inside Core would break that
	 * guarantee. ADR 0006 settles the division: the host fills the
	 * scope — from `_dataSource` injection or anything else — and
	 * bindings only read it.
	 *
	 * Absent = bindings resolve to `missing`, which renders as
	 * indeterminate rather than hidden.
	 */
	readonly renderScope?: EditorRenderScope;
	readonly pageAdapter?: EditorPageAdapter;
	readonly dataSourceAdapter?: EditorDataSourceAdapter;
	/**
	 * Strict-CSP authoring-style injection (§29). Absent = Core's
	 * default `<style>` element.
	 */
	readonly styleAdapter?: EditorStyleAdapter;
	readonly policies?: EditorPolicies;
}
