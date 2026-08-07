/**
 * @file `inspectEditorCapabilities` — the component-author adoption
 * report (PLAN-0020 CORE-P4-006; DD-0019 §26.2).
 *
 * §26.2: *"Development builds provide `inspectEditorCapabilities(config)`
 * to report missing declarations. Core never changes a component's DOM
 * automatically."*
 *
 * That second sentence is why this exists. Because Core will not guess
 * at a component's structure, everything the editor can do for a
 * component comes from what its author **declared** — and a component
 * that declared nothing looks, from the outside, exactly like one that
 * is broken. This turns "the inspector is empty for my component" into
 * "you are at Level 1; declare a style target granting a visual
 * property to reach Level 2".
 *
 * Pure and React-free on purpose: an author should be able to run this
 * from a unit test or a Node script over their `componentConfig`
 * without mounting a `<Studio>`.
 */

import type { AnvilComponentMetadata } from "@anvilkit/contracts/editor";
import {
	grantedProperties,
	grantsFamily,
	grantsLayoutContainer,
	readEditorMetadata,
} from "../puck/component-metadata.js";

/** The §26.2 adoption ladder. */
export type EditorAdoptionLevel = 0 | 1 | 2 | 3 | 4;

/** Human-readable name for each level (§26.2, verbatim). */
export const EDITOR_ADOPTION_LEVEL_NAMES: Readonly<
	Record<EditorAdoptionLevel, string>
> = {
	0: "Legacy",
	1: "Selectable",
	2: "Styleable",
	3: "Inline editable",
	4: "Composable",
};

/** One component's adoption status. */
export interface ComponentCapabilityReport {
	readonly componentType: string;
	readonly level: EditorAdoptionLevel;
	/** Declared capability names, in a stable order. */
	readonly declared: readonly string[];
	/**
	 * What this component still needs to reach `level + 1`. Empty at
	 * Level 4 — there is nothing above it.
	 */
	readonly missingForNextLevel: readonly string[];
	/**
	 * Structural problems worth fixing regardless of level, e.g. a
	 * declaration that parsed but cannot do anything.
	 */
	readonly warnings: readonly string[];
}

/** The whole-config report. */
export interface EditorCapabilityInspection {
	readonly components: readonly ComponentCapabilityReport[];
	/** How many components sit at each level. */
	readonly countsByLevel: Readonly<Record<EditorAdoptionLevel, number>>;
}

function declaredNames(metadata: AnvilComponentMetadata): string[] {
	const names: string[] = [];
	const targets = Object.keys(metadata.styleTargets ?? {});
	if (targets.length > 0) {
		names.push(`styleTargets[${targets.length}]`);
		names.push(`properties[${grantedProperties(metadata).size}]`);
	}
	if ((metadata.inlineText?.length ?? 0) > 0) {
		names.push(`inlineText[${metadata.inlineText?.length}]`);
	}
	if ((metadata.images?.length ?? 0) > 0) {
		names.push(`images[${metadata.images?.length}]`);
	}
	if (metadata.slots !== undefined) {
		names.push(`slots[${Object.keys(metadata.slots).length}]`);
	}
	if (metadata.interactions === true) names.push("interactions");
	if (metadata.bindings === true) names.push("bindings");
	return names;
}

/** Whether any declared target grants an authorable property (Level 2). */
function hasStyleCapability(metadata: AnvilComponentMetadata): boolean {
	return (
		grantsFamily(metadata, "layout") ||
		grantsFamily(metadata, "visual") ||
		grantsFamily(metadata, "typography")
	);
}

/** Whether an explicit inline or image target is declared (Level 3). */
function hasInlineTarget(metadata: AnvilComponentMetadata): boolean {
	return (
		(metadata.inlineText?.length ?? 0) > 0 || (metadata.images?.length ?? 0) > 0
	);
}

/** Whether the composition surface is declared (Level 4). */
function hasCompositionSurface(metadata: AnvilComponentMetadata): boolean {
	return (
		Object.keys(metadata.slots ?? {}).length > 0 &&
		metadata.interactions === true
	);
}

function levelOf(
	metadata: AnvilComponentMetadata | undefined,
): EditorAdoptionLevel {
	// Level 0 is both "no declaration" and "a declaration that names no
	// style target" — §26.2 defines Level 1 as a *stable root target*,
	// and an empty `styleTargets` is the author saying there isn't one.
	// (The v1 contract spelled this `styleTarget: "none"`.)
	if (
		metadata === undefined ||
		Object.keys(metadata.styleTargets ?? {}).length === 0
	) {
		return 0;
	}
	if (!hasStyleCapability(metadata)) {
		return 1;
	}
	if (!hasInlineTarget(metadata)) {
		return 2;
	}
	return hasCompositionSurface(metadata) ? 4 : 3;
}

function missingFor(
	level: EditorAdoptionLevel,
	metadata: AnvilComponentMetadata | undefined,
): string[] {
	switch (level) {
		case 0:
			return metadata === undefined
				? [
						"metadata.anvilkit.editor = { styleTargets: { root: { label, properties: [] } } }",
						"stamp each declared target with `anvilTargetAttrs(id, target)` so the compiler can address it",
					]
				: [
						"at least one entry in styleTargets — an empty map opts out of selection",
					];
		case 1:
			return [
				"at least one authorable property on a declared target (see AUTHORABLE_PROPERTY_LOCATIONS)",
			];
		case 2:
			return [
				"inlineText: [{ id, propPath, format }] for editable text",
				"or images: [{ id, srcPropPath, altPropPath }] for images",
			];
		case 3: {
			const missing: string[] = [];
			if (Object.keys(metadata?.slots ?? {}).length === 0) {
				missing.push(
					"slotMap: { <slotFieldName>: { allowedTypes?, reorder? } }",
				);
			}
			if (metadata?.interactions !== true) {
				missing.push("interactions: true");
			}
			return missing;
		}
		default:
			return [];
	}
}

function warningsFor(
	metadata: AnvilComponentMetadata | undefined,
	componentType: string,
	component: unknown,
): string[] {
	const warnings: string[] = [];
	if (metadata === undefined) {
		// Distinguish "no declaration" from "a declaration that failed to
		// parse" — they look identical downstream but need opposite fixes.
		const raw = (
			component as
				| { metadata?: { anvilkit?: { editor?: unknown } } }
				| undefined
		)?.metadata?.anvilkit?.editor;
		if (raw !== undefined && raw !== null) {
			warnings.push(
				"metadata.anvilkit.editor is present but not a valid declaration — it is being ignored entirely (it must be an object with a `styleTargets` record)",
			);
		}
		return warnings;
	}
	const responsiveTargets = Object.entries(metadata.styleTargets ?? {}).filter(
		([, target]) => target.responsive === true,
	);
	for (const [id, target] of responsiveTargets) {
		if (target.properties.length === 0) {
			warnings.push(
				`style target "${id}" is declared responsive but grants no properties — there is nothing for a breakpoint override to change`,
			);
		}
	}
	for (const target of metadata.images ?? []) {
		if (target.altPropPath === undefined) {
			warnings.push(
				`image target "${target.id}" declares no altPropPath — the accessibility rules cannot flag or fix missing alt text for ${componentType}`,
			);
		}
	}
	if (
		Object.keys(metadata.slots ?? {}).length > 0 &&
		!grantsLayoutContainer(metadata)
	) {
		warnings.push(
			"slots are declared but no target grants a container-layout property (gap, padding, columns, …) — children can be placed but the container itself cannot be laid out",
		);
	}
	return warnings;
}

/**
 * Report each component's §26.2 adoption level and what it would take
 * to reach the next one.
 *
 * Accepts anything shaped like a Puck config (`{ components }`), so it
 * can be called on a full config or a single-component object during
 * package development.
 */
export function inspectEditorCapabilities(
	config: unknown,
): EditorCapabilityInspection {
	const components = (
		config as { components?: Record<string, unknown> } | undefined
	)?.components;
	const reports: ComponentCapabilityReport[] = [];
	const countsByLevel: Record<EditorAdoptionLevel, number> = {
		0: 0,
		1: 0,
		2: 0,
		3: 0,
		4: 0,
	};

	for (const componentType of Object.keys(components ?? {}).sort()) {
		const component = (components as Record<string, unknown>)[componentType];
		const metadata = readEditorMetadata(component);
		const level = levelOf(metadata);
		countsByLevel[level] += 1;
		reports.push({
			componentType,
			level,
			declared: metadata === undefined ? [] : declaredNames(metadata),
			missingForNextLevel: missingFor(level, metadata),
			warnings: warningsFor(metadata, componentType, component),
		});
	}

	return { components: reports, countsByLevel };
}

/**
 * Format an inspection as a developer-readable report.
 *
 * Kept separate from {@link inspectEditorCapabilities} so the data is
 * usable in an assertion ("every component in this package is at least
 * Level 2") without parsing prose.
 */
export function formatEditorCapabilityReport(
	inspection: EditorCapabilityInspection,
): string {
	const lines: string[] = ["Editor capability adoption (DD-0019 §26.2)", ""];
	if (inspection.components.length === 0) {
		lines.push("  (no components found in this config)");
		return lines.join("\n");
	}
	for (const report of inspection.components) {
		lines.push(
			`  ${report.componentType} — Level ${report.level} (${
				EDITOR_ADOPTION_LEVEL_NAMES[report.level]
			})`,
		);
		if (report.declared.length > 0) {
			lines.push(`    declared: ${report.declared.join(", ")}`);
		}
		for (const missing of report.missingForNextLevel) {
			lines.push(`    to reach Level ${report.level + 1}: ${missing}`);
		}
		for (const warning of report.warnings) {
			lines.push(`    warning: ${warning}`);
		}
	}
	lines.push("");
	const summary = (Object.keys(inspection.countsByLevel) as unknown[])
		.map((key) => Number(key) as EditorAdoptionLevel)
		.map(
			(level) =>
				`L${level} ${EDITOR_ADOPTION_LEVEL_NAMES[level]}: ${inspection.countsByLevel[level]}`,
		)
		.join(" · ");
	lines.push(`  ${summary}`);
	return lines.join("\n");
}
