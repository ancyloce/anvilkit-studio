/**
 * @file Barrel for `src/document-model/` — the canonical read model
 * (PLAN-0026 §3.2, `p2-001`). This file is the module's **only**
 * export surface; nothing outside imports its internals directly.
 *
 * React-free by construction: the React binding (`useDocumentModel`)
 * lands in `p2-005` under `src/react/`, so this directory stays usable
 * by the compiler, the exporters and Node-side tooling alike.
 */

export {
	type ComponentEditSink,
	componentDocument,
	foldComponentDocument,
	variantCombinations,
} from "./component-document.js";
export {
	type ComponentLibraryModel,
	collectOrphanOverrides,
	type OrphanOverride,
	type ResolvedInstance,
	readComponentLibrary,
} from "./component-library.js";
export {
	CANONICAL_COMPONENT_INSTANCE_PROP,
	formatComponentPath,
	type MaterializeResult,
	materializeInstance,
	readComponentInstanceProp,
	runtimeNodeId,
	writeComponentInstanceProp,
} from "./materialize.js";
export { readDocument } from "./read-document.js";
export {
	type NodeFieldAddress,
	type NodeFieldRead,
	type NodeFieldSelector,
	readNodeField,
} from "./read-node-field.js";
export type {
	DocumentAnnotations,
	DocumentModel,
	DocumentNode,
	EditorAnnotation,
} from "./types.js";
