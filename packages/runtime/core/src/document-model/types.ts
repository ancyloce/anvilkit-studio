/**
 * @file PLAN-0026 §3.2 (`p2-001`) — the read model's shapes.
 *
 * `DocumentModel` is a **projection**, never a store. It holds no
 * state, subscribes to nothing, and is reproducible from
 * `(data, config)` alone. Report 0021's defect was reads projecting
 * from a sidecar the writes no longer populated; the structural fix is
 * that every field below is derived from the same Puck `Data` the
 * compiler and `<Render>` consume.
 *
 * Everything is deeply readonly. `p2-005` binds this through
 * `useDeferredValue`, which relies on unchanged nodes being
 * reference-equal across reads — so mutating a projection in place
 * would silently break inspector re-render behaviour.
 */

import type {
	AnvilAppearance,
	Binding,
	ComponentInstanceState,
	DesignSystem,
	DocumentComponentLibrary,
	InlineTextTarget,
	EditorAnnotations,
	Interaction,
} from "@anvilkit/contracts/editor";
import type { Config } from "@puckeditor/core";
import type { ResolvedStyleTarget } from "../puck/component-metadata.js";

/**
 * Re-exported from `@anvilkit/contracts/editor`, where `p3-006` moved
 * the canonical declaration when `editorAnnotations` became a declared
 * root prop. One definition, so the read model and the write path
 * cannot disagree about what a closed annotation is.
 */
export type {
	EditorAnnotation,
	/** Node id → annotation, from the declared `editorAnnotations` root prop. */
	EditorAnnotations as DocumentAnnotations,
} from "@anvilkit/contracts/editor";

/** One node's projected editor-visible state. */
export interface DocumentNode {
	readonly id: string;
	readonly type: string;
	/** From the declared `appearance` prop; `undefined` when unstyled. */
	readonly appearance: AnvilAppearance | undefined;
	/**
	 * The component type's declared style targets, in declaration
	 * order. A function of `type` + `config` only — never of this
	 * node's props — which is why it is cached per type.
	 */
	readonly styleTargets: readonly ResolvedStyleTarget[];
	/**
	 * Declared inline-text targets. Empty means the component declares
	 * no inline-text editing; that is *availability*, and callers must
	 * not fabricate support where the component declares none.
	 */
	readonly inlineText: readonly InlineTextTarget[];
	/** From the declared `interactions` carrier; invalid entries dropped. */
	readonly interactions: readonly Interaction[];
	/** From the declared `bindings` carrier; invalid entries dropped. */
	readonly bindings: readonly Binding[];
	/** Set when this node is an instance of a document-local component. */
	readonly componentInstance: ComponentInstanceState | undefined;
}

/** The whole document, projected once. */
export interface DocumentModel {
	/** Every node with a stable id, in `walkTree` visit order. */
	readonly nodes: ReadonlyMap<string, DocumentNode>;
	readonly designSystem: DesignSystem | undefined;
	readonly componentLibrary: DocumentComponentLibrary | undefined;
	readonly annotations: EditorAnnotations;
	/**
	 * The `Config` this model was projected from.
	 *
	 * Carried because the model is a projection of `(data, config)` and
	 * several reads are config-driven — `p2-003`'s `readNodeField`
	 * reuses `puck/read-appearance.ts`'s capability filtering, which
	 * resolves declared targets from the `Config` rather than guessing.
	 * Holding the config here is what lets that code be *reused* instead
	 * of reimplemented against `DocumentNode`.
	 *
	 * It is a stable reference, so it does not affect the structural
	 * sharing `p2-005` depends on.
	 */
	readonly config: Config;
}
