/**
 * @file Full deep `AuthoringStateV1` schema
 * (PLAN-0020 CORE-P0-005F; DD-0019 §7.1–§7.2).
 *
 * Composes every domain family over the shallow envelope and adds
 * the cross-collection invariants that are shape-checkable without
 * the Puck tree: map keys match each object's `id` (invariant 7).
 * Graph invariants (acyclic aliases/components, dangling reference
 * cleanup) belong to the core resolver and reconciliation engine.
 */

import type {
	Binding,
	BreakpointDefinition,
	ComponentDefinition,
	DesignToken,
	Interaction,
	NodeAuthoringStateV1,
	StyleDefinition,
	TokenMode,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import { BindingCollectionSchema } from "./bindings.js";
import { ComponentDefinitionCollectionSchema } from "./components.js";
import { InteractionCollectionSchema } from "./interactions.js";
import { NodeCollectionSchema } from "./node.js";
import { NonNegativeIntegerSchema } from "./primitives.js";
import { BreakpointSetSchema } from "./responsive.js";
import { StyleDefinitionCollectionSchema } from "./style-definitions.js";
import { TokenCollectionSchema, TokenModeCollectionSchema } from "./tokens.js";

/**
 * The sidecar envelope, declared locally.
 *
 * `p1-005` moved the sidecar contract out of published
 * `@anvilkit/contracts` into `@anvilkit/core`'s internals.
 * `@anvilkit/schema` is a FOUNDATION package and must not import from
 * a runtime one, so it carries its own view — mirroring the original
 * shape and reusing the member contracts that are still published.
 * The three modules that consume it (`compact`, `canonical-serialize`,
 * `migrations`) are the cluster `p1-006` audits for deletion; this
 * type dies with them.
 */
export interface AuthoringStateV1 {
	readonly version: "1";
	readonly revision: number;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly nodes: Readonly<Record<string, NodeAuthoringStateV1>>;
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly tokenModes: Readonly<Record<string, TokenMode>>;
	readonly styleDefinitions: Readonly<Record<string, StyleDefinition>>;
	readonly componentDefinitions: Readonly<Record<string, ComponentDefinition>>;
	readonly interactions: Readonly<Record<string, Interaction>>;
	readonly bindings: Readonly<Record<string, Binding>>;
}


function keysMatchIds(
	collection: Readonly<Record<string, { readonly id: string }>>,
	collectionName: string,
	ctx: { addIssue: (issue: z.core.$ZodRawIssue) => void },
): void {
	for (const [key, value] of Object.entries(collection)) {
		if (value.id !== key) {
			ctx.addIssue({
				code: "custom",
				message: `${collectionName} key "${key}" does not match its object's id "${value.id}" (invariant 7)`,
				path: [collectionName, key, "id"],
				input: value.id,
			});
		}
	}
}

/** The complete, deeply-validated authoring sidecar schema. */
export const AuthoringStateSchema: z.ZodType<AuthoringStateV1> = z
	.looseObject({
		version: z.literal("1"),
		revision: NonNegativeIntegerSchema,
		breakpoints: BreakpointSetSchema,
		nodes: NodeCollectionSchema,
		tokens: TokenCollectionSchema,
		tokenModes: TokenModeCollectionSchema,
		styleDefinitions: StyleDefinitionCollectionSchema,
		componentDefinitions: ComponentDefinitionCollectionSchema,
		interactions: InteractionCollectionSchema,
		bindings: BindingCollectionSchema,
	})
	.superRefine((state, ctx) => {
		keysMatchIds(state.tokens, "tokens", ctx);
		keysMatchIds(state.tokenModes, "tokenModes", ctx);
		keysMatchIds(state.styleDefinitions, "styleDefinitions", ctx);
		keysMatchIds(state.componentDefinitions, "componentDefinitions", ctx);
		keysMatchIds(state.interactions, "interactions", ctx);
		keysMatchIds(state.bindings, "bindings", ctx);
	}) as unknown as z.ZodType<AuthoringStateV1>;

/** Safe-parse the complete sidecar. Never throws. */
export function safeParseAuthoringState(value: unknown) {
	return AuthoringStateSchema.safeParse(value);
}

/** An empty, canonical v1 authoring state. */
export function createEmptyAuthoringState(): AuthoringStateV1 {
	return {
		version: "1",
		revision: 0,
		breakpoints: [],
		nodes: {},
		tokens: {},
		tokenModes: {},
		styleDefinitions: {},
		componentDefinitions: {},
		interactions: {},
		bindings: {},
	};
}
