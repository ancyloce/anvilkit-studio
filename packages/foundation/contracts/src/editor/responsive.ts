/**
 * @file Responsive value model (DD-0019 §9.1, §12).
 *
 * Desktop-first: an implicit `base` layer plus ordered `max-width`
 * breakpoints (DD-DEC-008). Matching breakpoints apply widest to
 * narrowest; the narrowest match wins property-wise.
 */

/**
 * Breakpoint identifier. The literal `"base"` is reserved for the
 * implicit base layer and is never a valid `BreakpointDefinition.id`
 * (contract freeze CORE-P0-001 §1.3; schema-enforced).
 */
export type BreakpointId = string;

/**
 * A per-breakpoint layered value.
 *
 * `null` in `overrides` clears the local override and resumes
 * inheritance; `undefined` means "never written" and is removed during
 * serialization (DD-0019 §9.1). Persisted canonical state never
 * contains `null` entries — the write-time `null` is normalized into
 * key removal by the reducer/compaction pipeline.
 */
export interface ResponsiveValue<T> {
	readonly base?: T;
	readonly overrides?: Readonly<Record<BreakpointId, T | null>>;
}

/**
 * One enabled breakpoint (DD-0019 §12.2): at most eight per document;
 * `maxWidth` is a unique integer 240–7680; `order` is display-only and
 * normalized from widths; `base` is implicit and never stored here.
 */
export interface BreakpointDefinition {
	readonly id: BreakpointId;
	readonly label: string;
	readonly maxWidth: number;
	readonly order: number;
	readonly enabled: boolean;
}

/**
 * The output of responsive resolution: the winning value, which layer
 * produced it, and whether it was inherited from a wider layer rather
 * than written at the resolved layer.
 */
export interface ResolvedValue<T> {
	readonly value: T | undefined;
	readonly source: "base" | BreakpointId | "default";
	readonly inherited: boolean;
}

/**
 * Layer address used by commands that write layered values: the
 * implicit base layer or one enabled breakpoint.
 * (Contract freeze CORE-P0-001 §1.3.)
 */
export type ResponsiveLayerRef = "base" | BreakpointId;

/**
 * The responsive-capable authoring families addressable by
 * `SetResponsiveOverrideCommand` (contract freeze CORE-P0-001 D-1).
 */
export type ResponsiveFamily =
	| "layout"
	| "style"
	| "typography"
	| "hidden"
	| "styleRefs";

/**
 * Transient responsive editor state (DD-0019 §12.3): actual viewport
 * size versus the active write target, follow mode, and the
 * overrides-only filter. Never undoable; never part of the sidecar.
 */
export interface ResponsiveEditorState {
	readonly viewportWidth: number;
	readonly viewportHeight?: number;
	readonly activeBreakpoint: ResponsiveLayerRef;
	readonly followViewport: boolean;
	readonly showOnlyOverrides: boolean;
}
