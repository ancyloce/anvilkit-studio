/**
 * @file Document-level design system root props (PLAN-0026 §2).
 *
 * Document-scoped, render-affecting state lives in DECLARED Puck root
 * props. There is one document form and it carries no version
 * vocabulary — neither these interfaces nor their schema mirrors have a
 * `version` member. `p7-002` stripped the stale `version` key from
 * every stored document; the schemas stay `looseObject` for generic
 * forward compatibility, not for that key.
 *
 * `revision` deliberately does not exist here: Puck history owns
 * undo/redo and the page-storage record version owns cross-session
 * concurrency.
 */

import type { ComponentDefinition } from "./components.js";
import type { BreakpointDefinition } from "./responsive.js";
import type { StyleDefinition } from "./style-definitions.js";
import type { DesignToken, TokenMode } from "./tokens.js";

/** The document design system, stored at `root.props.designSystem`. */
export interface DesignSystem {
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly tokenModes: Readonly<Record<string, TokenMode>>;
	readonly defaultTokenMode: string;
	readonly styleDefinitions: Readonly<Record<string, StyleDefinition>>;
}

/** Document-local component definitions at `root.props.componentLibrary`. */
export interface DocumentComponentLibrary {
	readonly definitions: Readonly<Record<string, ComponentDefinition>>;
}

/**
 * One node's editor annotation (PLAN-0026 §3.6, ADR 0007 decision 1).
 *
 * **This shape is permanently closed: `name` and `locked`, nothing
 * else.** Widening it requires the same scrutiny as adding a new root
 * prop, and the reason is not stylistic — an annotations map that
 * accepts arbitrary keys is the sidecar again under a new name, which
 * is the exact thing this program exists to delete. The Zod mirror
 * uses `strictObject` so an unknown key inside an entry is a
 * validation error rather than silently-preserved freight, which is
 * what makes "closed" enforceable instead of aspirational.
 *
 * Annotations are editor state *about* a node, not render state *of*
 * it, which is why they live in a root prop rather than in component
 * props. They are render-neutral and stripped at the IR boundary, so
 * the four consumers see identical output with or without them.
 */
export interface EditorAnnotation {
	readonly name?: string;
	readonly locked?: boolean;
}

/** Node id → annotation. The one document-state addition of the rewrite. */
export type EditorAnnotations = Readonly<Record<string, EditorAnnotation>>;

/** The declared root prop key annotations live under. */
export const EDITOR_ANNOTATIONS_PROP = "editorAnnotations";

/**
 * The root-prop surface a host page declares. Every member must be
 * declared as a Puck root field — the contract never relies on Puck
 * incidentally preserving unknown root props.
 */
export interface AnvilRootProps {
	readonly designSystem?: DesignSystem;
	readonly componentLibrary?: DocumentComponentLibrary;
	readonly editorAnnotations?: EditorAnnotations;
}
