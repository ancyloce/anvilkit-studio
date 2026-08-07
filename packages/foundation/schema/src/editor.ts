/**
 * @file Barrel for `@anvilkit/schema/editor` — versioned zod
 * validation, compaction, migration, and canonical serialization for
 * the AnvilKit Core visual editor sidecar (DD-0019; PLAN-0020
 * CORE-P0-005A..F, CORE-P0-006).
 *
 * Resolves through the package's existing `./*` wildcard export as
 * `dist/editor.js`; deep module imports
 * (`@anvilkit/schema/editor/<module>`) resolve the same way.
 *
 * Types come from `@anvilkit/contracts/editor`; this package owns the
 * **runtime** validation surface. Object schemas are `looseObject`
 * throughout: unknown keys are preserved for forward compatibility
 * and compaction never drops them.
 *
 * ---
 *
 * TOLERANCE IS A TIME-BOXED MIGRATION WINDOW, NOT A DESIGN FEATURE
 * (PLAN-0026 §5; PLAN-0028 `p1-006`).
 *
 * The canonical document has no version dimension. Until the store
 * migration runs in P7 (`p7-002`), a document written before
 * finalization may still carry a stale `version` key. These schemas
 * accept it — but only as *generic unknown-key preservation* falling
 * out of `looseObject`, never as a version branch. Nothing here reads
 * a `version` key to decide how to parse, and nothing may start:
 * a version branch in this directory is the sidecar returning under a
 * new name.
 *
 * The window CLOSES in `p7-002`. When that task lands, this paragraph
 * and the tolerance it describes are removed together. Do not read
 * this as licence to keep supporting two document shapes.
 *
 * `appearance.ts` — the canonical carrier — is already version-free
 * (`p1-001`). Seven `z.literal("1")` declarations survive elsewhere in
 * `./editor/`, in two groups. Both are deliberate; neither is dead
 * vocabulary someone forgot.
 *
 * GROUP 1 — the legacy `__anvilkit` sidecar, not the canonical
 * document. Retained until `p3-009` deletes their last production
 * consumer, `packages/runtime/core/src/editor/read-write.ts`:
 *
 * - `envelope.ts` keeps its literal because `detectAuthoringVersion`
 *   is what classifies an `unsupported-major` sidecar into read-only
 *   safe mode. That literal is the DD-0019 invariant-9 guard that
 *   stops a future-major sidecar being parsed and then overwritten;
 *   removing it converts a refusal into silent data loss.
 * - `authoring-state.ts` and `node.ts` keep theirs because they
 *   validate that same sidecar, which genuinely *is* version 1.
 *
 * GROUP 2 — `components.ts`, `interactions.ts`, `bindings.ts`,
 * `style-definitions.ts`. These *are* canonical document sub-shapes
 * and their literals are scheduled to go, but they cannot go from this
 * package alone: each schema is annotated `z.ZodType<T>` against a
 * contracts interface that still declares `readonly version: "1"`
 * (`contracts/src/editor/components.ts:88`, `interactions.ts:105`,
 * `bindings.ts:59`, `style-definitions.ts:30`). `p1-002` renamed those
 * types but was scoped to renames only. Dropping the literal here
 * alone is a hard `TS2322` — verified 2026-08-06 by doing it:
 * "Property 'version' is missing ... but required in type 'Binding'".
 * Contracts and schema must drop it in one change, together with every
 * fresh-object-literal construction site (excess-property checking
 * makes each one an error), several of which live in submodules.
 * Tracked as a follow-up on `p1-006`; not silently deferred.
 */

export {
	AnvilAppearanceSchema,
	AuthorableStylePropertySchema,
	AuthorStyleSchema,
	ComponentMetadataSchema,
	canonicalizeAppearance,
	DesignSystemSchema,
	DocumentComponentLibrarySchema,
	StyleTargetCapabilitySchema,
	safeParseAppearance,
	safeParseDesignSystem,
	TargetAppearanceSchema,
} from "./editor/appearance.js";
export {
	AuthoringStateSchema,
	createEmptyAuthoringState,
	safeParseAuthoringState,
} from "./editor/authoring-state.js";
export {
	BindingCollectionSchema,
	BindingSchema,
	BindingTargetSchema,
	SafeConditionSchema,
	SafeExpressionSchema,
} from "./editor/bindings.js";
export {
	type CanonicalAuthoringSerialization,
	canonicalSerializeAuthoring,
	canonicalSerializeFragment,
} from "./editor/canonical-serialize.js";
export {
	compactAuthoringState,
	compactNodeRecord,
	compactResponsiveValue,
	normalizeAuthoringState,
} from "./editor/compact.js";
export {
	COMPONENT_NESTING_DEPTH_LIMIT,
	ComponentDefinitionCollectionSchema,
	ComponentDefinitionSchema,
	ComponentInstanceStateSchema,
	ComponentPropDefinitionSchema,
	SerializablePuckNodeSchema,
} from "./editor/components.js";
export {
	CSS_MATH_MAX_DEPTH,
	CssBoxEdgesSchema,
	CssColorSchema,
	CssCornersSchema,
	CssLengthSchema,
	CssMathExpressionSchema,
	CssUnitSchema,
	GridTrackListSchema,
	GridTrackSchema,
	SizeValueSchema,
	tokenOrLiteralSchema,
} from "./editor/css.js";
export {
	AuthoringEnvelopeSchema,
	type AuthoringVersionDetection,
	detectAuthoringVersion,
	safeParseAuthoringEnvelope,
} from "./editor/envelope.js";
export {
	AnimatablePropertySchema,
	AnimationStepSchema,
	CubicBezierSchema,
	InteractionActionSchema,
	InteractionCollectionSchema,
	InteractionSchema,
	InteractionTriggerSchema,
	MotionTransitionSchema,
	SafeUrlSchema,
} from "./editor/interactions.js";
export { JsonValueSchema } from "./editor/json.js";
export {
	CssAlignmentSchema,
	CssJustificationSchema,
	LayoutSpecSchema,
} from "./editor/layout.js";
export {
	type AuthoringMigration,
	AuthoringMigrationError,
	type AuthoringMigrationRegistry,
	CURRENT_AUTHORING_VERSION,
	createAuthoringMigrationRegistry,
} from "./editor/migrations/index.js";
export {
	AccessibilityOverrideSchema,
	NodeAuthoringStateSchema,
	NodeCollectionSchema,
} from "./editor/node.js";
export {
	addLimitIssue,
	BreakpointIdSchema,
	EDITOR_LIMIT_ISSUE,
	type EditorCountLimitKey,
	FiniteNumberSchema,
	IdSchema,
	limitedRecordSchema,
	NonNegativeFiniteNumberSchema,
	NonNegativeIntegerSchema,
	PersistedNodeIdSchema,
	PropertyPathSchema,
	PropertyPathSegmentSchema,
	responsiveValueSchema,
	UnitIntervalSchema,
} from "./editor/primitives.js";
export {
	BreakpointDefinitionSchema,
	BreakpointSetSchema,
	normalizeBreakpointOrder,
} from "./editor/responsive.js";
export {
	BorderEdgeSchema,
	BorderSpecSchema,
	CssBlendModeSchema,
	CssCursorSchema,
	FilterSpecSchema,
	GradientStopSchema,
	ImageSourceSchema,
	PaintSchema,
	ShadowSpecSchema,
	VisualStyleSpecSchema,
} from "./editor/style.js";
export {
	StyleDefinitionCollectionSchema,
	StyleDefinitionSchema,
} from "./editor/style-definitions.js";
export {
	DesignTokenSchema,
	DesignTokenSourceSchema,
	TokenCollectionSchema,
	TokenModeCollectionSchema,
	TokenModeSchema,
	TokenTypeSchema,
	TokenValueSchema,
} from "./editor/tokens.js";
export {
	FontFamilyNameSchema,
	FontWeightSchema,
	TypographySpecSchema,
} from "./editor/typography.js";
export {
	ComponentVariantSchema,
	NodeOverridePatchSchema,
	VariantAxisOptionSchema,
	VariantAxisSchema,
} from "./editor/variants.js";
