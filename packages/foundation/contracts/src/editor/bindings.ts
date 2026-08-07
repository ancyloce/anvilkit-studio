/**
 * @file Safe data binding contracts (DD-0019 §19).
 *
 * Arbitrary JavaScript is never evaluated: the expression language is
 * a closed AST (depth ≤16, node count ≤256) whose evaluator reads own
 * enumerable properties only, blocks `__proto__`/`prototype`/
 * `constructor`, and never invokes functions or getters.
 */

import type { JsonValue } from "./values.js";

/** Binding identifier. */
export type BindingId = string;

/**
 * The safe expression AST (DD-0019 §19, verbatim). Function calls,
 * member access on functions, and getter traversal are structurally
 * unrepresentable.
 */
export type SafeExpression =
	| { readonly type: "literal"; readonly value: JsonValue }
	| {
			readonly type: "path";
			readonly root: "data" | "item" | "index" | "page";
			readonly path: readonly string[];
	  }
	| { readonly type: "coalesce"; readonly values: readonly SafeExpression[] }
	| {
			readonly type: "compare";
			readonly operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
			readonly left: SafeExpression;
			readonly right: SafeExpression;
	  }
	| {
			readonly type: "boolean";
			readonly operator: "and" | "or";
			readonly values: readonly SafeExpression[];
	  }
	| { readonly type: "not"; readonly value: SafeExpression };

/**
 * A condition is a boolean-evaluated {@link SafeExpression}
 * (interaction conditions, visibility bindings).
 */
export type SafeCondition = SafeExpression;

/** What a binding writes to (DD-0019 §19, verbatim). */
export type BindingTarget =
	| { readonly type: "prop"; readonly path: readonly (string | number)[] }
	| { readonly type: "visibility" }
	| {
			readonly type: "repeat";
			readonly itemName: string;
			readonly limit?: number;
	  };

/** A stored binding (DD-0019 §19, verbatim). */
export interface Binding {
	readonly version: "1";
	readonly id: BindingId;
	readonly nodeId: string;
	readonly target: BindingTarget;
	readonly expression: SafeExpression;
	readonly fallback?: JsonValue;
}

/**
 * A host data source visible to the binding editor. Descriptors are
 * stored by Core; credentials and preview responses never are.
 */
export interface DataSourceDescriptor {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
}

/**
 * A minimal recursive schema for a data source, enough to drive path
 * pickers and validation. `fields` is present for `object` schemas,
 * `items` for `array` schemas.
 */
export interface DataSchema {
	readonly type: "object" | "array" | "string" | "number" | "boolean";
	readonly fields?: Readonly<Record<string, DataSchema>>;
	readonly items?: DataSchema;
	readonly nullable?: boolean;
}

/** A preview-data request (caps: 5 s timeout, 2 MiB, 50 records). */
export interface PreviewDataRequest {
	readonly sourceId: string;
	/** Path into the source, for scoped previews. Empty = whole source. */
	readonly path?: readonly string[];
	/** Record cap for repeat previews; defaults to 50. */
	readonly limit?: number;
}

/**
 * Host adapter that supplies data sources to the binding editor
 * (DD-0019 §19, verbatim; follows the `plugin-asset-manager`
 * host-adapter idiom). Preview requests time out after five seconds
 * and accept at most 2 MiB.
 */
export interface EditorDataSourceAdapter {
	listSources(signal: AbortSignal): Promise<readonly DataSourceDescriptor[]>;
	getSchema(sourceId: string, signal: AbortSignal): Promise<DataSchema>;
	getPreviewData(
		request: PreviewDataRequest,
		signal: AbortSignal,
	): Promise<JsonValue>;
}
