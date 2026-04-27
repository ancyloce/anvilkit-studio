/**
 * @file AI generation contract — the types `@anvilkit/schema`,
 * `@anvilkit/validator`, and AI copilot plugins pass between each
 * other when asking an LLM to generate or validate page content.
 *
 * ### Shape of the contract
 *
 * - {@link AiComponentSchema} is a describable-to-an-LLM version of a
 *   Puck component config. `@anvilkit/schema` (Phase 3) derives this
 *   from a Puck `Config` automatically; Core just owns the
 *   destination shape.
 * - {@link AiGenerationContext} is the complete input to a single
 *   LLM call — the available components plus optional environment
 *   hints (current page data, theme, locale).
 * - {@link AiValidationResult} is the output of validating an LLM
 *   response against the expected shape. `@anvilkit/validator` owns
 *   the runtime check; Core owns the result shape.
 *
 * ### Design rules
 *
 * 1. **Types only.** No runtime code.
 * 2. **Closed field-type union.** {@link AiFieldSchema.type} is a
 *    fixed set — adding a new field type is a breaking change so
 *    plugin authors are forced to handle every case.
 * 3. **Type-only Puck import.** `Data` is imported via `import type`
 *    and erased at compile time — `ai.ts` adds zero runtime
 *    reference to `@puckeditor/core`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-006-types-domain.md | core-006}
 */

import type { Data as PuckData } from "@puckeditor/core";

/**
 * The finite set of field types an AI schema can describe.
 *
 * Mirrors Puck's own field type union closely but is intentionally a
 * separate, stable enum — the AI contract must not break every time
 * Puck adds or renames a field type. `@anvilkit/schema` maps Puck
 * field types to these values during derivation.
 *
 * Closed union by design: extending this list is a breaking change
 * to the AI contract.
 */
export type AiFieldType =
	| "text"
	| "richtext"
	| "number"
	| "boolean"
	| "image"
	| "url"
	| "color"
	| "select"
	| "array"
	| "object";

/**
 * Description of a single prop on a component, in a shape an LLM can
 * reason about.
 *
 * `@anvilkit/schema`'s `configToAiContext()` (Phase 3) produces an
 * array of these from a Puck `Config` field descriptor. The AI
 * copilot plugin then feeds them into its system prompt so the model
 * knows which props it can set and what shape each one takes.
 *
 * Recursive: `select` fields carry {@link options}, `array` fields
 * carry {@link itemSchema}, and `object` fields carry their own
 * nested {@link itemSchema} describing the object shape.
 */
export interface AiFieldSchema {
	/**
	 * The prop name on the owning component (e.g. `"title"`,
	 * `"ctaHref"`). Must match the key in the component's
	 * `defaultProps`.
	 */
	readonly name: string;
	/**
	 * The field's data type. See {@link AiFieldType}.
	 */
	readonly type: AiFieldType;
	/**
	 * Whether the prop must be set for the component to render
	 * correctly. Defaults to `false` when omitted — the LLM will
	 * treat the field as optional.
	 */
	readonly required?: boolean;
	/**
	 * Human-readable description of what the prop is for. Forwarded
	 * verbatim into the LLM prompt, so write it in the voice of
	 * instructions to a collaborator ("The headline shown at the
	 * top of the hero section").
	 */
	readonly description?: string;
	/**
	 * For `type: "select"` fields, the allowed values. Each option
	 * carries both the machine-readable `value` (written into the
	 * prop) and the human-readable `label` (shown to the LLM so it
	 * picks the right one).
	 */
	readonly options?: readonly { readonly label: string; readonly value: string }[];
	/**
	 * For `type: "array"` fields, the schema of a single item. When the
	 * item is itself an object, the item carries its own
	 * {@link properties} listing the typed sub-fields.
	 *
	 * Absent on scalar field types and on `type: "object"` (which uses
	 * {@link properties} directly).
	 */
	readonly itemSchema?: AiFieldSchema;
	/**
	 * For `type: "object"` fields (and `type: "array"` items whose
	 * `itemSchema.type === "object"`), the typed sub-fields of the
	 * object. Each entry is a fully-formed {@link AiFieldSchema} so
	 * the LLM and the validator can reason about nested structure
	 * without parsing free-form descriptions.
	 *
	 * Absent on scalar field types.
	 */
	readonly properties?: readonly AiFieldSchema[];
	/**
	 * For slot fields (mapped to `type: "object"`), the list of
	 * component names that may be inserted into the slot. When
	 * omitted, any registered component is allowed.
	 *
	 * Mirrors Puck's `allow` array on slot field definitions.
	 */
	readonly allow?: readonly string[];
	/**
	 * For slot fields (mapped to `type: "object"`), the list of
	 * component names that may *not* be inserted into the slot.
	 *
	 * Mirrors Puck's `disallow` array on slot field definitions.
	 */
	readonly disallow?: readonly string[];
}

/**
 * Description of a single component in a shape an LLM can reason
 * about — name, purpose, props, and an optional concrete example.
 *
 * An array of these is passed to the LLM so it knows what components
 * are available and how to use them. Produced by
 * `@anvilkit/schema`'s `configToAiContext()` (Phase 3) from a Puck
 * `Config`; Core only owns the destination shape.
 */
export interface AiComponentSchema {
	/**
	 * The component name as registered in the Puck config (e.g.
	 * `"Hero"`, `"Button"`, `"Card"`). Matches the `type` used in
	 * Puck's component data.
	 */
	readonly componentName: string;
	/**
	 * Human-readable description of what the component does and when
	 * to use it. Forwarded verbatim into the LLM prompt — write it
	 * as guidance to a collaborator.
	 */
	readonly description: string;
	/**
	 * The component's props, described field-by-field.
	 */
	readonly fields: readonly AiFieldSchema[];
	/**
	 * Optional concrete example of a valid prop bag. The LLM uses
	 * this as a one-shot example of how the fields should look when
	 * populated; leaving it off falls back to zero-shot from the
	 * field descriptions alone.
	 */
	readonly example?: Readonly<Record<string, unknown>>;
}

/**
 * The full input to a single LLM generation call.
 *
 * Constructed by the AI copilot plugin at the moment the user asks
 * for generation. {@link availableComponents} is derived from the
 * Puck `Config` once per session and cached; the remaining fields
 * are per-call hints.
 */
export interface AiGenerationContext {
	/**
	 * Every component the LLM is allowed to emit, described as an
	 * {@link AiComponentSchema}. The LLM cannot use a component that
	 * is not present in this list.
	 */
	readonly availableComponents: readonly AiComponentSchema[];
	/**
	 * Optional snapshot of the current Puck page data. Lets the LLM
	 * generate contextual edits (e.g. "add a CTA to the existing
	 * hero") instead of always producing a full page from scratch.
	 */
	readonly currentData?: PuckData;
	/**
	 * Optional theme hint (`"light"` or `"dark"`) so the LLM can
	 * pick appropriate colors, imagery, and tone. Host apps
	 * typically forward the current editor theme.
	 */
	readonly theme?: "light" | "dark";
	/**
	 * Optional BCP 47 language tag (e.g. `"en-US"`, `"fr-FR"`) so
	 * the LLM generates copy in the right language.
	 */
	readonly locale?: string;
}

/**
 * A single issue produced by validating an LLM's response against
 * the expected component/field shape.
 *
 * `@anvilkit/validator` (Phase 3) owns the runtime check that emits
 * these; Core just owns the shape so validator output flows through
 * a stable contract.
 */
export interface AiValidationIssue {
	/**
	 * JSON-pointer-style path to the offending value inside the LLM
	 * response (e.g. `"content.0.props.title"`). Empty string means
	 * the issue applies to the response as a whole.
	 */
	readonly path: string;
	/**
	 * Human-readable message describing what went wrong. Suitable
	 * for display in a dev console or a toast.
	 */
	readonly message: string;
	/**
	 * Severity of the issue.
	 *
	 * - `"warn"` — the response is usable but suspect (e.g. an
	 *   unexpected extra field).
	 * - `"error"` — the response is unusable (e.g. required field
	 *   missing, wrong type).
	 */
	readonly severity: "error" | "warn";
}

/**
 * The outcome of validating an LLM response.
 *
 * {@link valid} is `true` only when the response contains zero
 * issues with `severity: "error"` — `"warn"`-level issues may be
 * present even when the response is considered valid.
 */
export interface AiValidationResult {
	/**
	 * `true` iff the response contains no `severity: "error"`
	 * issues. A valid response may still carry `"warn"` entries in
	 * {@link issues}.
	 */
	readonly valid: boolean;
	/**
	 * The full list of issues found. Empty array when the response
	 * passed without complaint.
	 */
	readonly issues: readonly AiValidationIssue[];
}
