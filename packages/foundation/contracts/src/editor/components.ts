/**
 * @file Document-local component contracts (DD-0019 §14; DD-DEC-009).
 *
 * Definitions are sidecar-backed and travel with the document
 * (`AuthoringStateV1.componentDefinitions`); no external definition
 * source exists in v1 (OQ-005 deferred). Definition node IDs stay
 * stable across revisions; the runtime composite
 * `${instanceNodeId}::${definitionNodeId}` is **never persisted**
 * (contract freeze CORE-P0-001 §1.1).
 */

import type { ResponsiveValue } from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
import type { JsonValue, PropertyPath } from "./values.js";

/**
 * Component definition identifier: opaque, non-empty, caller-generated
 * (`crypto.randomUUID()` at the call site — reducers never generate
 * IDs), unique within the document, stable across revisions.
 */
export type ComponentDefinitionId = string;

/**
 * A serializable Puck node subtree. Structurally equivalent to Puck's
 * `ComponentData` restricted to JSON-safe props: slot content is
 * encoded the way Puck stores it — arrays of node objects inside
 * `props`. The shape is owned here (rather than aliasing Puck's
 * generic types) so serializability is guaranteed by construction;
 * assignability from JSON-safe `ComponentData` is covered by contract
 * tests. No runtime Puck import (DD-0019 §30.5 as read per C-6).
 */
export interface SerializablePuckNode {
	readonly type: string;
	readonly props: Readonly<Record<string, JsonValue>>;
}

/** One exposed component property (DD-0019 §14.2, verbatim). */
export interface ComponentPropDefinition {
	readonly id: string;
	readonly name: string;
	readonly type: "text" | "number" | "boolean" | "image" | "enum" | "slot";
	readonly sourcePath: readonly (string | number)[];
	readonly defaultValue?: JsonValue;
}

/** One option of a variant axis. */
export interface VariantAxisOption {
	readonly id: string;
	readonly name: string;
}

/** A variant axis (≤3 per component; caps schema-enforced). */
export interface VariantAxis {
	readonly id: string;
	readonly name: string;
	readonly options: readonly VariantAxisOption[];
}

/**
 * An override patch targeting one definition node: prop values plus
 * the universal authoring families. Applied per the §14.4 precedence
 * (definition base → variant patch → exposed prop override → instance
 * node override → breakpoint override).
 */
export interface NodeOverridePatch {
	readonly props?: Readonly<Record<string, JsonValue>>;
	readonly layout?: ResponsiveValue<LayoutSpec>;
	readonly style?: ResponsiveValue<VisualStyleSpec>;
	readonly typography?: ResponsiveValue<TypographySpec>;
	readonly hidden?: ResponsiveValue<boolean>;
}

/**
 * One variant: a full axis selection plus the definition-node patches
 * it applies (≤20 combinations per component; caps schema-enforced).
 */
export interface ComponentVariant {
	readonly id: string;
	readonly name?: string;
	/** Variant axis id → option id; every axis must be selected. */
	readonly selection: Readonly<Record<string, string>>;
	/** Definition node id → patch applied when this variant is active. */
	readonly patch: Readonly<Record<string, NodeOverridePatch>>;
}

/** A document-local component definition (DD-0019 §14.2, verbatim). */
export interface ComponentDefinitionV1 {
	readonly version: "1";
	readonly id: ComponentDefinitionId;
	readonly name: string;
	readonly root: SerializablePuckNode;
	readonly exposedProps: readonly ComponentPropDefinition[];
	readonly variantAxes: readonly VariantAxis[];
	readonly variants: readonly ComponentVariant[];
	readonly revision: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Per-instance component state (DD-0019 §14.2, verbatim). Stored on
 * the instance node's authoring record; retained unchanged while a
 * referenced definition is unresolvable (ED-COMP-007).
 */
export interface ComponentInstanceState {
	readonly definitionId: ComponentDefinitionId;
	readonly definitionRevision: number;
	/** Variant axis id → option id. */
	readonly variantSelection: Readonly<Record<string, string>>;
	/** Exposed prop id → override value. */
	readonly propOverrides: Readonly<Record<string, JsonValue>>;
	/** Definition node id → override patch. Keys are bare definition
	 * node IDs — never the runtime composite form. */
	readonly nodeOverrides: Readonly<Record<string, NodeOverridePatch>>;
}

/**
 * Override address used by the reset/promote lifecycle commands:
 * a definition node plus a property path rooted at that node's
 * `props` (≥1 segment — contract freeze CORE-P0-001 §1.2).
 */
export interface ComponentOverrideTarget {
	readonly definitionNodeId: string;
	readonly propertyPath: PropertyPath;
}
