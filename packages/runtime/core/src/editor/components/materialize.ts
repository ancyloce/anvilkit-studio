/**
 * @file Re-export shim for the component materializer.
 *
 * The implementation moved to `src/document-model/materialize.ts` in
 * `p2-004`: it was always carrier-agnostic, and PLAN-0026 §3.1 deletes
 * this directory wholesale at `p3-009`, so keeping the algorithm here
 * would have deleted it with the sidecar. This file exists only so the
 * sidecar-era callers (`editor/index.ts` and its tests) keep resolving;
 * it carries no logic and is removed with the rest of the directory.
 */

export {
	COMPONENT_INSTANCE_PROP,
	collectDefinitionNodeIds,
	formatComponentPath,
	type MaterializeResult,
	matchVariant,
	materializeInstance,
	runtimeNodeId,
} from "../../document-model/materialize.js";
