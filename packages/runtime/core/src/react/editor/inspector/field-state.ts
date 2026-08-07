"use client";

/**
 * @file Inspector field-state computation (PLAN-0020 CORE-P1A-005;
 * DD-0019 §11.2–§11.3, ED-INSPECT-001/002).
 *
 * Pure helpers that project one property of one authoring family
 * across the current multi-selection into the
 * {@link InspectorFieldState} union the controls render:
 *
 * - `value` — every selected (capable) node agrees at the write layer;
 *   carries the §12.3 source/inheritance provenance for the
 *   value-source display.
 * - `mixed` — capable nodes disagree; controls render the mixed
 *   placeholder and a write fans out to the whole selection.
 * - `unset` — no capable node has the property anywhere in its
 *   cascade at the write layer; the resolved fallback (inherited or
 *   default) is carried for placeholder display.
 * - `unsupported` — no selected node's component declares the
 *   family's capability; the section/control hides or disables.
 *
 * The fifth union member (`invalid`) is deliberately **not** produced
 * here: invalid drafts are transient control state kept out of
 * durable stores (§11.3) — each control owns its draft until it
 * parses, then commits through the port.
 */

import type {
	BreakpointDefinition,
	NodeAuthoringStateV1,
	ResolvedValue,
	ResponsiveLayerRef,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";
import {
	deepEqualJson,
	resolveResponsiveValue,
} from "../../../editor/index.js";

/** The authoring families the universal inspector edits in Phase 1A. */
export type InspectorFamily = "layout" | "style" | "typography";

/** One field's computed state across the selection. */
export type InspectorFieldState<T> =
	| {
			readonly kind: "value";
			readonly value: T;
			/** §12.3 provenance of the effective value (source display). */
			readonly resolved: ResolvedValue<T>;
			/** True when the value is written at the active write layer. */
			readonly writtenAtLayer: boolean;
	  }
	| { readonly kind: "mixed" }
	| {
			readonly kind: "unset";
			/** The effective (inherited/default) value, for placeholders. */
			readonly resolved: ResolvedValue<T>;
	  }
	| { readonly kind: "unsupported" };

/**
 * Project one property out of a family's `ResponsiveValue<Spec>` into
 * a per-property `ResponsiveValue<T>` (the granularity §12.3
 * resolution and the source display operate on).
 */
export function projectProperty<T>(
	family: ResponsiveValue<Record<string, unknown>> | undefined,
	property: string,
): ResponsiveValue<T> | undefined {
	if (family === undefined) {
		return undefined;
	}
	const base = (family.base as Record<string, unknown> | undefined)?.[
		property
	] as T | undefined;
	let overrides: Record<string, T | null> | undefined;
	for (const [breakpointId, spec] of Object.entries(family.overrides ?? {})) {
		if (spec === null) {
			continue;
		}
		const entry = (spec as Record<string, unknown>)[property] as T | undefined;
		if (entry !== undefined) {
			overrides ??= {};
			overrides[breakpointId] = entry;
		}
	}
	if (base === undefined && overrides === undefined) {
		return undefined;
	}
	return {
		...(base !== undefined ? { base } : {}),
		...(overrides !== undefined ? { overrides } : {}),
	};
}

/** Inputs for {@link readFieldState}. */
export interface ReadFieldStateInput {
	readonly authoring: AuthoringStateV1;
	/** The selected node ids whose components support the family. */
	readonly nodeIds: readonly string[];
	readonly family: InspectorFamily;
	/** Top-level property name within the family spec. */
	readonly property: string;
	/** The active write layer (`"base"` or a breakpoint id). */
	readonly layer: ResponsiveLayerRef;
	readonly breakpoints: readonly BreakpointDefinition[];
	/** Viewport width the provenance display resolves against. */
	readonly viewportWidth: number;
}

function familyOf(
	record: NodeAuthoringStateV1 | undefined,
	family: InspectorFamily,
): ResponsiveValue<Record<string, unknown>> | undefined {
	return record?.[family] as
		| ResponsiveValue<Record<string, unknown>>
		| undefined;
}

function writtenAt<T>(
	value: ResponsiveValue<T> | undefined,
	layer: ResponsiveLayerRef,
): T | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (layer === "base") {
		return value.base;
	}
	const entry = value.overrides?.[layer];
	return entry === null ? undefined : entry;
}

/**
 * Compute one property's {@link InspectorFieldState} across the
 * selection. Callers pass only capability-supporting node ids — an
 * empty list means no selected node supports the family
 * (`unsupported`).
 */
export function readFieldState<T>(
	input: ReadFieldStateInput,
): InspectorFieldState<T> {
	const {
		authoring,
		nodeIds,
		family,
		property,
		layer,
		breakpoints,
		viewportWidth,
	} = input;
	if (nodeIds.length === 0) {
		return { kind: "unsupported" };
	}

	const projections = nodeIds.map((nodeId) =>
		projectProperty<T>(familyOf(authoring.nodes[nodeId], family), property),
	);
	const layerValues = projections.map((projection) =>
		writtenAt(projection, layer),
	);
	const resolutions = projections.map((projection) =>
		resolveScalar(projection, breakpoints, viewportWidth),
	);

	const first = layerValues[0];
	const allLayerEqual = layerValues.every((value) =>
		deepEqualJson(value, first),
	);
	if (!allLayerEqual) {
		return { kind: "mixed" };
	}
	if (first !== undefined) {
		const resolved = resolutions[0] as ResolvedValue<T>;
		return { kind: "value", value: first, resolved, writtenAtLayer: true };
	}

	// Nothing written at the layer: agree on the effective value too?
	const firstResolved = resolutions[0] as ResolvedValue<T>;
	const allResolvedEqual = resolutions.every((resolution) =>
		deepEqualJson(resolution.value, firstResolved.value),
	);
	if (!allResolvedEqual) {
		return { kind: "mixed" };
	}
	if (firstResolved.value !== undefined) {
		return {
			kind: "value",
			value: firstResolved.value,
			resolved: firstResolved,
			writtenAtLayer: false,
		};
	}
	return { kind: "unset", resolved: firstResolved };
}

/**
 * Scalar replacement is the per-property merge rule (§12.3) — the
 * property-wise merge applies at the spec level, which
 * {@link projectProperty} already flattened away.
 */
function resolveScalar<T>(
	projection: ResponsiveValue<T> | undefined,
	breakpoints: readonly BreakpointDefinition[],
	viewportWidth: number,
): ResolvedValue<T> {
	return resolveResponsiveValue(
		projection,
		breakpoints,
		viewportWidth,
		(_base, override) => override,
	);
}
