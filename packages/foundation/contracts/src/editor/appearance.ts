/**
 * @file PLAN-0025 §5.1 — Puck-native node authoring props (v2).
 *
 * In the v2 model every render-affecting node value lives in that
 * node's own Puck component props, keyed by named style target —
 * replacing the v1 sidecar's node map. Reuses the existing spec,
 * responsive, interaction, and binding contracts verbatim; only the
 * carrier shape is new.
 *
 * Canonicalization rule (enforced by `@anvilkit/schema/editor`): an
 * appearance object with no effective content must canonicalize to
 * `undefined` — empty shells are never stored on nodes.
 */

import type { BindingV1 } from "./bindings.js";
import type { InteractionV1 } from "./interactions.js";
import type { ResponsiveValue } from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
import type { StyleDefinitionId } from "./style-definitions.js";

/** A component-declared style target name (metadata v2 key). */
export type StyleTargetId = string;

/**
 * One layer of authored style for a target: the three existing spec
 * families under their v2 names (`visual` carries `VisualStyleSpec`).
 */
export interface AuthorStyleV1 {
	readonly layout?: LayoutSpec;
	readonly visual?: VisualStyleSpec;
	readonly typography?: TypographySpec;
}

/** Authored appearance for ONE declared target of a node. */
export interface TargetAppearanceV1 {
	readonly styleRefs?: ResponsiveValue<readonly StyleDefinitionId[]>;
	readonly style?: ResponsiveValue<AuthorStyleV1>;
	readonly hidden?: ResponsiveValue<boolean>;
}

/**
 * The versioned per-node appearance prop. `targets` keys must match
 * the component's declared `metadata.anvilkit.editor.styleTargets`;
 * unknown targets are compiler diagnostics, never silently styled.
 */
export interface AnvilAppearanceV1 {
	readonly version: "1";
	readonly targets?: Readonly<Record<StyleTargetId, TargetAppearanceV1>>;
}

/**
 * The v2 authoring feature props a component may declare. Interaction
 * ownership is the trigger node; binding ownership is the bound node
 * (plan §5.1 ownership rules). Cross-node references use stable
 * component `props.id` values and are references, not containment.
 */
export interface AnvilNodeFeatureProps {
	readonly appearance?: AnvilAppearanceV1;
	readonly interactions?: readonly InteractionV1[];
	readonly bindings?: readonly BindingV1[];
}

/** A component's business props widened with the authoring props. */
export type AuthorableProps<T extends object> = T & AnvilNodeFeatureProps;
