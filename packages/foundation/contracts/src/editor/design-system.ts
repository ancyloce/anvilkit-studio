/**
 * @file Document-level design system root props (PLAN-0026 §2).
 *
 * Document-scoped, render-affecting state lives in DECLARED Puck root
 * props. There is one document form and it carries no version
 * vocabulary — neither these interfaces nor their schema mirrors have a
 * `version` member. Documents written before the rename may still carry
 * a stale `version` key; the schemas are `looseObject`, so it is
 * preserved as an unknown key and read by nothing, until `p7-002`
 * strips it from the store.
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
 * The root-prop surface a host page declares. Both members must be
 * declared as Puck root fields — the contract never relies on Puck
 * incidentally preserving unknown root props.
 */
export interface AnvilRootProps {
	readonly designSystem?: DesignSystem;
	readonly componentLibrary?: DocumentComponentLibrary;
}
