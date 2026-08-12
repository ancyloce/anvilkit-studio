/**
 * @file Puck-native node authoring props (PLAN-0026 §2).
 *
 * Every render-affecting node value lives in that node's own Puck
 * component props, keyed by named style target. There is one document
 * form and it carries no version vocabulary: these interfaces have no
 * `version` member, and the schema mirror does not require one.
 * `p7-002` stripped the stale `version` key from every stored
 * document, so a document in contract no longer carries one; the
 * schemas stay `looseObject` for generic forward compatibility, not
 * for that key.
 *
 * Canonicalization rule (enforced by `@anvilkit/schema/editor`): an
 * appearance object with no effective content must canonicalize to
 * `undefined` — empty shells are never stored on nodes.
 */

import type { Binding } from "./bindings.js";
import type { Interaction } from "./interactions.js";
import type { ResponsiveValue } from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
import type { StyleDefinitionId } from "./style-definitions.js";

/** A component-declared style target name. */
export type StyleTargetId = string;

/**
 * One layer of authored style for a target: the three spec families
 * (`visual` carries `VisualStyleSpec`).
 */
export interface AuthorStyle {
	readonly layout?: LayoutSpec;
	readonly visual?: VisualStyleSpec;
	readonly typography?: TypographySpec;
}

/** Authored appearance for ONE declared target of a node. */
export interface TargetAppearance {
	readonly styleRefs?: ResponsiveValue<readonly StyleDefinitionId[]>;
	readonly style?: ResponsiveValue<AuthorStyle>;
	readonly hidden?: ResponsiveValue<boolean>;
}

/**
 * The per-node appearance prop. `targets` keys must match the
 * component's declared `metadata.anvilkit.editor.styleTargets`;
 * unknown targets are compiler diagnostics, never silently styled.
 */
export interface AnvilAppearance {
	readonly targets?: Readonly<Record<StyleTargetId, TargetAppearance>>;
}

/**
 * The authoring feature props a component may declare. Interaction
 * ownership is the trigger node; binding ownership is the bound node.
 * Cross-node references use stable component `props.id` values and are
 * references, not containment.
 */
export interface AnvilNodeFeatureProps {
	readonly appearance?: AnvilAppearance;
	readonly interactions?: readonly Interaction[];
	readonly bindings?: readonly Binding[];
}

/** A component's business props widened with the authoring props. */
export type AuthorableProps<T extends object> = T & AnvilNodeFeatureProps;
