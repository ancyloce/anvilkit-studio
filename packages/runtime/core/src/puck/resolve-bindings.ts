/**
 * @file P4-04 — binding evaluation as an official Puck `resolveData`
 * adapter (PLAN-0025 §9.4).
 *
 * §5.1 stores binding declarations on the bound node
 * (`props.bindings: BindingV1[]`); this module makes them take effect
 * through Puck's public data-resolution machinery and nothing else:
 * `withBindingResolution(config)` wraps every component's
 * `resolveData` hook so that
 *
 * - **prop targets** evaluate their safe expression (the PLAN-0020
 *   §19 evaluator — arbitrary JavaScript is structurally
 *   unrepresentable) and write the value at the target prop path;
 * - **visibility targets** that resolve to hidden write
 *   `appearance.targets.root.hidden = { base: true }`, so the hidden
 *   state rides the SAME unified compiler pipeline as authored hidden
 *   state (one algorithm — §9.2 step 5 hands the resolved Data to
 *   both the compiler and `<Render>`). `indeterminate` stays visible,
 *   mirroring the editor's preview semantics (`isVisibleInPreview`);
 * - **repeat targets** are left untouched: `resolveData` resolves one
 *   node's props and cannot fan a node out into rows. Repeat
 *   expansion remains a render-path concern and index-keyed repeats
 *   are already blocked by the export preflight
 *   (`repeatExportBlockers`).
 *
 * The evaluation scope is host-supplied, never fetched here (ADR
 * 0006). Production passes it through the official metadata channel —
 * `resolveAllData(data, config, { [BINDING_SCOPE_METADATA_KEY]:
 * scope })` — and the editor inherits the same hook through Puck's own
 * resolveData lifecycle, so both surfaces resolve identically. The
 * `page` root defaults to the document's own `root.props`, which the
 * hook receives from Puck directly.
 *
 * Wrapping is idempotent: a config already wrapped is returned with
 * its existing hooks intact (marker-checked), so `withBindingResolution`
 * can sit safely in a module-level config factory.
 */

import type {
	AnvilAppearanceV1,
	BindingV1,
	JsonValue,
} from "@anvilkit/contracts/editor";
import type { ComponentConfig, Config } from "@puckeditor/core";
import { evaluateExpression } from "../editor/bindings/evaluate.js";
import {
	isVisibleInPreview,
	resolveVisibility,
} from "../editor/bindings/repeat.js";

/**
 * Key under which the production pipeline passes the binding scope via
 * `resolveAllData`'s metadata parameter (merged by Puck into every
 * `resolveData` call's `params.metadata`).
 */
export const BINDING_SCOPE_METADATA_KEY = "anvilkitBindingScope";

/** Host-supplied roots a production binding expression may read. */
export interface ProductionBindingScope {
	/** External (data-source) payload — `path` root `"data"`. */
	readonly data?: JsonValue;
	/**
	 * Page-level payload — `path` root `"page"`. Defaults to the
	 * document's `root.props` when omitted.
	 */
	readonly page?: JsonValue;
}

/** Marker identifying an already-wrapped `resolveData` hook. */
const WRAPPED = Symbol.for("anvilkit.bindingResolveData");

/** §19 depth cap, reused as the write-path length cap. */
const MAX_PATH_LENGTH = 16;

/** Segments that would rewrite the prototype chain — never written. */
const BLOCKED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Reserved carrier props a binding may never overwrite: the node's
 * identity and the §5.1 authoring carriers (a binding rewriting its
 * own declarations would be self-modifying data).
 */
const RESERVED_ROOT_PROPS = new Set([
	"id",
	"appearance",
	"bindings",
	"interactions",
]);

type ResolveDataHook = NonNullable<ComponentConfig["resolveData"]>;
type ResolveDataParams = Parameters<ResolveDataHook>[1];
type NodeShape = Parameters<ResolveDataHook>[0];

/**
 * Wrap every component's `resolveData` with §5.1 binding application.
 * Pure with respect to its input: returns a new `Config` whose
 * component entries carry the composed hook; already-wrapped hooks are
 * kept as-is.
 */
export function withBindingResolution(config: Config): Config {
	const components: Record<string, ComponentConfig> = {};
	for (const [type, component] of Object.entries(config.components)) {
		components[type] = wrapComponent(component as ComponentConfig);
	}
	return { ...config, components } as Config;
}

function wrapComponent(component: ComponentConfig): ComponentConfig {
	const original = component.resolveData as
		| (ResolveDataHook & { [WRAPPED]?: true })
		| undefined;
	if (original?.[WRAPPED] === true) return component;

	const wrapped: ResolveDataHook & { [WRAPPED]?: true } = async (
		node,
		params,
	) => {
		const boundProps = applyNodeBindings(
			(node as { props: Record<string, unknown> }).props,
			scopeOf(params),
		);
		const boundNode =
			boundProps === (node as { props: unknown }).props
				? node
				: ({ ...node, props: boundProps } as NodeShape);
		if (original === undefined) return boundNode;
		// Chain the component's own hook AFTER binding application so it
		// observes bound values; its partial props win on conflict.
		const out = await original(boundNode, params);
		return {
			...out,
			props: {
				...(boundNode as { props: Record<string, unknown> }).props,
				...(out as { props?: Record<string, unknown> }).props,
			},
		} as Awaited<ReturnType<ResolveDataHook>>;
	};
	wrapped[WRAPPED] = true;
	return { ...component, resolveData: wrapped };
}

/**
 * Assemble the evaluation scope for one `resolveData` call: the
 * host-supplied roots from the metadata channel, with `page`
 * defaulting to the document's own root props.
 */
function scopeOf(params: ResolveDataParams): {
	data?: JsonValue;
	page?: JsonValue;
} {
	const metadata = params.metadata as
		| Record<string, unknown>
		| null
		| undefined;
	const supplied = metadata?.[BINDING_SCOPE_METADATA_KEY] as
		| ProductionBindingScope
		| undefined;
	const rootProps = (params.root as { props?: unknown } | undefined)?.props;
	return {
		data: supplied?.data,
		page: supplied?.page ?? (rootProps as JsonValue | undefined),
	};
}

/** Apply a node's §5.1 bindings to its props. Pure; `props` on no-op. */
function applyNodeBindings(
	props: Record<string, unknown>,
	scope: { data?: JsonValue; page?: JsonValue },
): Record<string, unknown> {
	const bindings = props.bindings;
	if (!Array.isArray(bindings) || bindings.length === 0) return props;

	let next = props;
	for (const candidate of bindings) {
		const binding = candidate as BindingV1;
		// §5.1 ownership: a stored binding binds THIS node. A foreign
		// nodeId is a data error — skipped, never applied elsewhere.
		if (binding.nodeId !== props.id) continue;

		if (binding.target.type === "prop") {
			const result = evaluateExpression(binding.expression, scope);
			let value: JsonValue;
			if (result.status === "value") {
				value = result.value;
			} else if (binding.fallback !== undefined) {
				value = binding.fallback;
			} else {
				// Missing/refused with no fallback: the authored prop value
				// stays — unfiltered beats vanished (§19 preview trade).
				continue;
			}
			const written = setAtPath(next, binding.target.path, value);
			if (written !== null) next = written;
			continue;
		}

		if (binding.target.type === "visibility") {
			const resolution = resolveVisibility(binding.expression, scope);
			if (!isVisibleInPreview(resolution)) {
				next = hideRootTarget(next);
			}
		}
		// target.type === "repeat": render-path concern (see file doc).
	}
	return next;
}

/**
 * Decisively hide the node: the root target's `hidden` becomes
 * `{ base: true }`, REPLACING any authored responsive hidden value — a
 * false visibility condition means "not on this page", not "hidden
 * except where a breakpoint override says otherwise".
 */
function hideRootTarget(
	props: Record<string, unknown>,
): Record<string, unknown> {
	const appearance = (props.appearance ?? { version: "1" }) as Record<
		string,
		unknown
	> &
		AnvilAppearanceV1;
	const targets = (appearance.targets ?? {}) as Record<
		string,
		Record<string, unknown>
	>;
	const root = targets.root ?? {};
	return {
		...props,
		appearance: {
			...appearance,
			targets: {
				...targets,
				root: { ...root, hidden: { base: true } },
			},
		},
	};
}

/**
 * Immutable write of `value` at `path` inside `props`. Returns `null`
 * (write refused) for an empty/overlong path, a blocked or reserved
 * segment, or a path that traverses a non-container. Missing
 * intermediate containers are created (object for a string segment,
 * array for a numeric one); array writes must land at an existing
 * index or the append position.
 */
function setAtPath(
	props: Record<string, unknown>,
	path: readonly (string | number)[],
	value: JsonValue,
): Record<string, unknown> | null {
	if (path.length === 0 || path.length > MAX_PATH_LENGTH) return null;
	const head = path[0];
	if (typeof head !== "string" || RESERVED_ROOT_PROPS.has(head)) return null;
	for (const segment of path) {
		if (typeof segment === "string" && BLOCKED_SEGMENTS.has(segment)) {
			return null;
		}
	}
	return setInContainer(props, path, 0, value) as Record<
		string,
		unknown
	> | null;
}

function setInContainer(
	container: unknown,
	path: readonly (string | number)[],
	depth: number,
	value: JsonValue,
): unknown {
	const segment = path[depth];
	if (segment === undefined) return null;
	const last = depth === path.length - 1;

	if (typeof segment === "number") {
		if (!Number.isInteger(segment) || segment < 0) return null;
		const list = Array.isArray(container) ? container : [];
		if (segment > list.length) return null;
		const copy = list.slice();
		if (last) {
			copy[segment] = value;
			return copy;
		}
		const child = setInContainer(copy[segment], path, depth + 1, value);
		if (child === null) return null;
		copy[segment] = child;
		return copy;
	}

	const record =
		container !== null &&
		typeof container === "object" &&
		!Array.isArray(container)
			? (container as Record<string, unknown>)
			: {};
	if (last) return { ...record, [segment]: value };
	const child = setInContainer(record[segment], path, depth + 1, value);
	if (child === null) return null;
	return { ...record, [segment]: child };
}
