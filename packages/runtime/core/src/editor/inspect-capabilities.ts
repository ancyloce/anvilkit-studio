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
 * "you are at Level 1; add `capabilities.visualStyle` to reach Level 2".
 *
 * Pure and React-free on purpose: an author should be able to run this
 * from a unit test or a Node script over their `componentConfig`
 * without mounting a `<Studio>`.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import { readEditorMetadata } from "./capability-metadata.js";

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

const CAPABILITY_ORDER = [
	"layoutContainer",
	"layoutItem",
	"visualStyle",
	"typography",
	"responsive",
	"interactions",
	"bindings",
	"inlineText",
	"imageAdjust",
] as const;

function declaredNames(metadata: EditorCapabilityMetadata): string[] {
	const names: string[] = [];
	for (const key of CAPABILITY_ORDER) {
		const value = metadata.capabilities[key];
		if (value === true) {
			names.push(key);
			continue;
		}
		if (Array.isArray(value) && value.length > 0) {
			names.push(`${key}[${value.length}]`);
		}
	}
	if (metadata.slotMap !== undefined) {
		names.push(`slotMap[${Object.keys(metadata.slotMap).length}]`);
	}
	return names;
}

/** Whether any styling-adjacent capability is declared (Level 2). */
function hasStyleCapability(metadata: EditorCapabilityMetadata): boolean {
	const capabilities = metadata.capabilities;
	return (
		capabilities.layoutContainer === true ||
		capabilities.layoutItem === true ||
		capabilities.visualStyle === true ||
		capabilities.typography === true
	);
}

/** Whether an explicit inline target is declared (Level 3). */
function hasInlineTarget(metadata: EditorCapabilityMetadata): boolean {
	return (
		(metadata.capabilities.inlineText?.length ?? 0) > 0 ||
		(metadata.capabilities.imageAdjust?.length ?? 0) > 0
	);
}

/** Whether the composition surface is declared (Level 4). */
function hasCompositionSurface(metadata: EditorCapabilityMetadata): boolean {
	return (
		Object.keys(metadata.slotMap ?? {}).length > 0 &&
		metadata.capabilities.interactions === true
	);
}

function levelOf(
	metadata: EditorCapabilityMetadata | undefined,
): EditorAdoptionLevel {
	// Level 0 is both "no declaration" and "declared, but explicitly not
	// a style target" — §26.2 defines Level 1 as a *stable root target*,
	// and `styleTarget: "none"` is the author saying there isn't one.
	if (metadata === undefined || metadata.styleTarget === "none") {
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
	metadata: EditorCapabilityMetadata | undefined,
): string[] {
	switch (level) {
		case 0:
			return metadata === undefined
				? [
						'metadata.editor = { version: "1", styleTarget: "root", capabilities: {} }',
						"render a single stable root element that carries the props Core stamps",
					]
				: ['styleTarget: "root" (or "wrapper") — "none" opts out of selection'];
		case 1:
			return [
				"at least one of capabilities.layoutContainer / layoutItem / visualStyle / typography",
			];
		case 2:
			return [
				"capabilities.inlineText: [{ id, propPath, format }] for editable text",
				"or capabilities.imageAdjust: [{ id, srcPropPath, altPropPath }] for images",
			];
		case 3: {
			const missing: string[] = [];
			if (Object.keys(metadata?.slotMap ?? {}).length === 0) {
				missing.push(
					"slotMap: { <slotFieldName>: { allowedTypes?, reorder? } }",
				);
			}
			if (metadata?.capabilities.interactions !== true) {
				missing.push("capabilities.interactions: true");
			}
			return missing;
		}
		default:
			return [];
	}
}

function warningsFor(
	metadata: EditorCapabilityMetadata | undefined,
	componentType: string,
	component: unknown,
): string[] {
	const warnings: string[] = [];
	if (metadata === undefined) {
		// Distinguish "no declaration" from "a declaration that failed to
		// parse" — they look identical downstream but need opposite fixes.
		const raw = (component as { metadata?: { editor?: unknown } } | undefined)
			?.metadata?.editor;
		if (raw !== undefined && raw !== null) {
			warnings.push(
				`metadata.editor is present but not a valid v1 declaration — it is being ignored entirely (check \`version: "1"\` and \`styleTarget\`)`,
			);
		}
		return warnings;
	}
	if (
		metadata.capabilities.responsive === true &&
		!hasStyleCapability(metadata)
	) {
		warnings.push(
			"capabilities.responsive is declared but no layout/style/typography capability is — there is nothing for a breakpoint override to change",
		);
	}
	for (const target of metadata.capabilities.imageAdjust ?? []) {
		if (target.altPropPath === undefined) {
			warnings.push(
				`imageAdjust target "${target.id}" declares no altPropPath — the accessibility rules cannot flag or fix missing alt text for ${componentType}`,
			);
		}
	}
	if (
		Object.keys(metadata.slotMap ?? {}).length > 0 &&
		metadata.capabilities.layoutContainer !== true
	) {
		warnings.push(
			"slotMap is declared without capabilities.layoutContainer — children can be placed but the container itself cannot be laid out",
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
