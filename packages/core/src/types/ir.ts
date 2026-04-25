/**
 * @file Page Intermediate Representation (IR) — the normalized,
 * serializable shape every Studio export format consumes.
 *
 * ### Why an IR layer at all?
 *
 * Puck's `Data` is authoring-shaped: it carries component ids, UI
 * state, drag-and-drop metadata, and keys that only matter inside the
 * editor. Exporters (HTML, React, JSON, …) shouldn't have to know
 * about any of that. They take a `PageIR` and emit output.
 *
 * The `@anvilkit/ir` package (Phase 3) owns `puckDataToIR()`, the
 * transformation from `Data → PageIR`. `@anvilkit/core` owns **only
 * the contract** — the types that describe what a valid IR looks like.
 *
 * ### Design rules
 *
 * 1. **Types only.** This file has zero runtime code. No `const`, no
 *    `function`, no `class`. It compiles down to an empty `.js` file
 *    under `verbatimModuleSyntax: true`.
 * 2. **Closed unions.** `PageIRAsset.kind` is a fixed union rather
 *    than `… | string`, so exporters are forced to handle every case
 *    at the type level. Extending the union is a breaking change by
 *    design.
 * 3. **Versioned root.** `PageIR.version` is a string literal `"1"`,
 *    not a number — `"1" | "2"` avoids floating-point surprises and
 *    matches the convention used by most IR versioning schemes.
 * 4. **Frozen for `0.1.x` alpha.** Shape changes require a Core major
 *    bump. The version literal exists so that when a future `"2"`
 *    ships, a migration shim can discriminate the two.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-006-types-domain.md | core-006}
 */

/**
 * An out-of-band resource referenced by the page — images, videos,
 * fonts, stylesheets, inline scripts, etc.
 *
 * Assets are listed both at the root of {@link PageIR} (so exporters
 * can emit a manifest or preload block in one pass) and, optionally,
 * on individual {@link PageIRNode}s (so a node-scoped exporter can
 * resolve its own dependencies without walking the whole tree).
 *
 * The same asset may appear in both places — exporters are expected
 * to deduplicate by {@link PageIRAsset.id}.
 */
export interface PageIRAsset {
	/**
	 * Stable, unique identifier for this asset within the IR.
	 *
	 * Typically a hash of the URL or a caller-provided slug. Exporters
	 * use this for deduplication when the same asset is referenced by
	 * multiple nodes.
	 */
	readonly id: string;
	/**
	 * The asset's category.
	 *
	 * Closed union — extending this list is a breaking change to the
	 * IR contract. Use `"other"` for anything that doesn't fit the
	 * named categories rather than introducing an ad-hoc string.
	 */
	readonly kind: "image" | "video" | "font" | "script" | "style" | "other";
	/**
	 * Absolute or root-relative URL pointing at the asset.
	 *
	 * Exporters may rewrite this (e.g. to a CDN or a hashed filename)
	 * during serialization — the IR shape does not constrain the
	 * scheme.
	 */
	readonly url: string;
	/**
	 * Free-form metadata the producer wants to pass through to
	 * consumers (e.g. `{ width: 1600, height: 900 }` for an image).
	 *
	 * Exporters should treat unknown keys as forward-compatible — a
	 * missing key must not cause a hard failure.
	 */
	readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * A single node in the page IR tree.
 *
 * Structurally recursive: every node may carry a `children` array of
 * further nodes, mirroring the component tree the author laid out in
 * the editor. Leaf nodes omit `children` entirely rather than setting
 * it to an empty array (the distinction is not semantically
 * meaningful, but omitting the key keeps serialized IR snapshots
 * smaller).
 *
 * ### `type` vs `id`
 *
 * - {@link id} is a stable per-node identifier, unique within a
 *   single {@link PageIR} instance. Used by exporters for
 *   key/anchor/href generation.
 * - {@link type} is the component name the node was produced from
 *   (e.g. `"Hero"`, `"Button"`). Exporters map this to their own
 *   render logic.
 *
 * ### Why `Readonly<Record<string, unknown>>` for props?
 *
 * The IR has no awareness of specific component prop shapes — that's
 * the exporter's job. Keeping props opaque keeps the type surface
 * small and makes `PageIR` JSON-serializable without a discriminator
 * explosion.
 */
export interface PageIRNode {
	/**
	 * Stable per-node identifier, unique within its owning
	 * {@link PageIR}. Typically carried over from Puck's component
	 * data id so round-tripping is straightforward.
	 */
	readonly id: string;
	/**
	 * The component name this node was produced from
	 * (e.g. `"Hero"`, `"Button"`). Exporters dispatch on this value
	 * to select a renderer.
	 */
	readonly type: string;
	/**
	 * Serialized prop bag for this node.
	 *
	 * Opaque to the IR — exporters are responsible for interpreting
	 * the keys they care about and ignoring the rest.
	 */
	readonly props: Readonly<Record<string, unknown>>;
	/**
	 * Optional parent slot/zone name this node belongs to.
	 *
	 * Top-level nodes in the root content omit this field. Nested
	 * nodes produced from a Puck slot field carry the slot field key
	 * here so `irToPuckData()` can rebuild the correct parent prop.
	 */
	readonly slot?: string;
	/**
	 * Distinguishes modern Puck slot fields from legacy `data.zones`
	 * entries when {@link slot} is present. Omitted means `"slot"`.
	 */
	readonly slotKind?: "slot" | "zone";
	/**
	 * Optional child nodes. Absent on leaf nodes.
	 */
	readonly children?: readonly PageIRNode[];
	/**
	 * Optional assets scoped to this node.
	 *
	 * Duplicates from {@link PageIR.assets} are allowed and expected
	 * — exporters deduplicate by {@link PageIRAsset.id}.
	 */
	readonly assets?: readonly PageIRAsset[];
}

/**
 * Page-level metadata — title, description, and timestamps the
 * exporter may surface in `<head>`, a feed, or a manifest.
 *
 * All fields are optional so minimal IR snapshots can be produced
 * without forcing the caller to synthesize values they don't have.
 *
 * Timestamps are ISO 8601 strings (not `Date` instances) so the IR
 * remains JSON-serializable without a custom replacer.
 */
export interface PageIRMetadata {
	/**
	 * Optional page title (e.g. surfaced in `<title>` and Open Graph).
	 */
	readonly title?: string;
	/**
	 * Optional page description (e.g. surfaced in
	 * `<meta name="description">`).
	 */
	readonly description?: string;
	/**
	 * Optional ISO 8601 timestamp of page creation.
	 */
	readonly createdAt?: string;
	/**
	 * Optional ISO 8601 timestamp of most-recent page update.
	 */
	readonly updatedAt?: string;
}

/**
 * The root IR document — the single argument passed to every
 * {@link import("./export.js").ExportFormatDefinition.run} call.
 *
 * Produced by `@anvilkit/ir`'s `puckDataToIR()` (Phase 3). Core
 * declares the shape; it does not implement the transformation.
 */
export interface PageIR {
	/**
	 * Schema version of this IR document.
	 *
	 * Literal `"1"` for the initial contract. A future `"2"` would be
	 * a breaking change to IR shape and requires a migration shim in
	 * `@anvilkit/ir`. String (not number) to avoid JSON
	 * floating-point surprises and to match the convention used by
	 * most serialized IR schemas.
	 */
	readonly version: "1";
	/**
	 * The root node of the page tree.
	 *
	 * Exporters walk this recursively to produce output.
	 */
	readonly root: PageIRNode;
	/**
	 * Top-level asset manifest. Every asset referenced anywhere in
	 * the tree should appear here exactly once; node-scoped
	 * {@link PageIRNode.assets} entries are an optimization for
	 * exporters that process nodes independently.
	 */
	readonly assets: readonly PageIRAsset[];
	/**
	 * Page-level metadata block. See {@link PageIRMetadata}.
	 */
	readonly metadata: PageIRMetadata;
}
