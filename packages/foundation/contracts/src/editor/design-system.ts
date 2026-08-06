/**
 * @file PLAN-0025 §5.2 — document-level design system root props (v2).
 *
 * Document-scoped, render-affecting state moves from the v1 sidecar
 * into DECLARED Puck root props. The collection member types are the
 * existing v1 contracts verbatim; only the carrier moves.
 *
 * `revision` deliberately does not exist here: Puck history owns
 * undo/redo and the page-storage record version owns cross-session
 * concurrency (plan §4.1).
 */

import type { ComponentDefinitionV1 } from "./components.js";
import type { BreakpointDefinition } from "./responsive.js";
import type { StyleDefinitionV1 } from "./style-definitions.js";
import type { DesignToken, TokenMode } from "./tokens.js";

/** The document design system, stored at `root.props.designSystem`. */
export interface DesignSystemV1 {
	readonly version: "1";
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly tokens: Readonly<Record<string, DesignToken>>;
	readonly tokenModes: Readonly<Record<string, TokenMode>>;
	readonly defaultTokenMode: string;
	readonly styleDefinitions: Readonly<Record<string, StyleDefinitionV1>>;
}

/** Document-local component definitions at `root.props.componentLibrary`. */
export interface DocumentComponentLibraryV1 {
	readonly version: "1";
	readonly definitions: Readonly<Record<string, ComponentDefinitionV1>>;
}

/**
 * The v2 root-prop surface a host page declares. All three members
 * must be declared as Puck root fields — v2 never relies on Puck
 * incidentally preserving unknown root props (plan §5.2).
 */
export interface AnvilKitV2RootProps {
	readonly designSystem?: DesignSystemV1;
	readonly componentLibrary?: DocumentComponentLibraryV1;
	readonly authoringSchemaVersion?: 2;
}
