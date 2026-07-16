/**
 * @file `readFieldPresentation()` — Inspector presentation hints read
 * from Puck's own per-field `metadata` bag (`BaseField.metadata`,
 * `interface FieldMetadata extends Metadata {}` — an open
 * `{[key: string]: any}` record).
 *
 * This is the SAME extension channel `NumberField`'s unit suffix
 * already established: presentation hints are optional, additive, and
 * flow through existing Puck config — plugins and component packages
 * contribute them without Core importing anything. A field with no
 * metadata (or metadata this module does not recognize) renders
 * exactly as before, so the entire model is backward compatible.
 *
 * Recognized keys (all optional):
 * - `section`   — Inspector group id. Canonical ids follow DESIGN.md
 *   §7.8 (`content`, `actions`, `appearance`, `layout`, `advanced`);
 *   any other non-empty string becomes a custom group rendered after
 *   the canonical ones. Fields without a section keep today's flat,
 *   ungrouped placement.
 * - `layout`    — `"property-row"` opts a SIMPLE field into the
 *   compact two-column label/control row. Everything else (including
 *   the explicit `"full-width"`) keeps the stacked layout; complex
 *   fields ignore the hint entirely rather than cram into a row.
 * - `description` — muted helper text under the control, associated
 *   to the input via `aria-describedby`.
 * - `order`     — relative order within a section (stable sort;
 *   fields without an order keep authoring order).
 * - `unit`      — display-only unit suffix for `number` fields
 *   (pre-existing behavior, reader centralized here).
 * - `units`     — allowed units/semantic keywords for the dimension
 *   control on `text` fields.
 * - `control`   — `"dimension"` opts a `text` field into the
 *   unit-aware `DimensionControl`.
 *
 * Presentation never replaces the field schema or validation — it
 * only affects how the existing value is presented.
 */

export const CANONICAL_FIELD_SECTIONS = [
	"content",
	"actions",
	"appearance",
	"layout",
	"advanced",
] as const;

export type CanonicalFieldSection = (typeof CANONICAL_FIELD_SECTIONS)[number];

/** i18n key for a canonical section title. */
export function fieldSectionTitleKey(section: CanonicalFieldSection): string {
	return `studio.fields.section.${section}`;
}

export function isCanonicalFieldSection(
	section: string,
): section is CanonicalFieldSection {
	return (CANONICAL_FIELD_SECTIONS as readonly string[]).includes(section);
}

export interface StudioFieldPresentation {
	readonly section?: string;
	readonly layout?: "property-row" | "full-width";
	readonly description?: string;
	readonly order?: number;
	readonly unit?: string;
	readonly units?: readonly string[];
	readonly control?: "dimension";
}

const EMPTY_PRESENTATION: StudioFieldPresentation = {};

function readString(
	bag: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = bag[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readLayout(
	bag: Record<string, unknown>,
): StudioFieldPresentation["layout"] {
	const value = bag.layout;
	return value === "property-row" || value === "full-width" ? value : undefined;
}

function readOrder(bag: Record<string, unknown>): number | undefined {
	const value = bag.order;
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function readUnits(
	bag: Record<string, unknown>,
): readonly string[] | undefined {
	const value = bag.units;
	if (!Array.isArray(value)) return undefined;
	const units = value.filter(
		(entry): entry is string => typeof entry === "string" && entry.length > 0,
	);
	return units.length > 0 ? units : undefined;
}

function readControl(
	bag: Record<string, unknown>,
): StudioFieldPresentation["control"] {
	return bag.control === "dimension" ? "dimension" : undefined;
}

/**
 * Parse a field `metadata` bag into presentation hints. Every read is
 * type-guarded; unrecognized shapes are dropped rather than thrown on,
 * so third-party metadata can never break field rendering.
 */
export function readFieldPresentation(
	metadata: unknown,
): StudioFieldPresentation {
	if (metadata === null || typeof metadata !== "object") {
		return EMPTY_PRESENTATION;
	}
	const bag = metadata as Record<string, unknown>;
	return {
		section: readString(bag, "section"),
		layout: readLayout(bag),
		description: readString(bag, "description"),
		order: readOrder(bag),
		unit: readString(bag, "unit"),
		units: readUnits(bag),
		control: readControl(bag),
	};
}
