/**
 * @file The authoring sidecar envelope (DD-0019 §7.1; DD-DEC-003).
 *
 * All durable editor metadata lives in one versioned document at
 * `PuckData.root.props.__anvilkit`. The sidecar keeps business
 * component props clean, lets node IDs act as stable indices, makes
 * tree and metadata changes part of one Puck history entry, preserves
 * the existing `<Studio data>` contract, and passes through PageIR v1
 * as opaque root props. Puck 0.23.0 preserves unknown root props
 * through every reducer action, history restore, and `onChange`
 * emission (verified against the installed dist; regression-netted by
 * the `testing/editor` fixture pack).
 */

import type { Binding } from "@anvilkit/contracts/editor";
import type { ComponentDefinition } from "@anvilkit/contracts/editor";
import type { Interaction } from "@anvilkit/contracts/editor";
import type { NodeAuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { BreakpointDefinition } from "@anvilkit/contracts/editor";
import type { StyleDefinition } from "@anvilkit/contracts/editor";
import type { DesignToken, TokenMode } from "@anvilkit/contracts/editor";

/**
 * The root-props key that carries the authoring sidecar. The root
 * component config must not define a slot field with this name;
 * config decoration fails fast when it does (invariant 11, §7.2).
 */
export const ANVILKIT_AUTHORING_KEY = "__anvilkit" as const;

/**
 * The versioned authoring sidecar (DD-0019 §7.1, verbatim).
 *
 * Invariants (§7.2): `version` is exactly `"1"`; `revision`
 * increments once per committed editor command and is restored by
 * undo; `nodes` holds records only when non-default state exists; map
 * keys match each object's `id`; token aliases and component
 * references are acyclic; unknown major versions are read-only and
 * never overwritten; all writes produce schema-valid canonical state.
 */
export interface AuthoringStateV1 {
	readonly version: "1";
	readonly revision: number;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly nodes: Readonly<Record<string, NodeAuthoringStateV1>>;
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly tokenModes: Readonly<Record<string, TokenMode>>;
	readonly styleDefinitions: Readonly<Record<string, StyleDefinition>>;
	readonly componentDefinitions: Readonly<
		Record<string, ComponentDefinition>
	>;
	readonly interactions: Readonly<Record<string, Interaction>>;
	readonly bindings: Readonly<Record<string, Binding>>;
}

/**
 * Width-subtyping carrier for the sidecar on Puck root props
 * (DD-0019 §7.1). Reading uses one typed accessor in
 * `@anvilkit/core/editor` (`readAuthoringState`); no entry point may
 * write `root.props.__anvilkit` directly (§10.1).
 */
export interface AnvilKitRootProps {
	readonly __anvilkit?: AuthoringStateV1;
}
