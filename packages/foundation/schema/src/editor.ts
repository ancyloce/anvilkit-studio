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
 */

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
