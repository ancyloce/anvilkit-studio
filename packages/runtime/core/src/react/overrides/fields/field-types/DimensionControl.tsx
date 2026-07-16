/**
 * @file `DimensionControl` — unit-aware editor for `text` fields that
 * carry CSS dimension strings (`"100px"`, `"1.5rem"`, `"auto"`).
 *
 * Opt-in via the field's own metadata (`metadata.control =
 * "dimension"`); the committed value stays the plain Puck string, so
 * the data model is untouched — this is presentation only, and a host
 * that removes the metadata gets the ordinary text input back for the
 * same stored values.
 *
 * Units come from `metadata.units` (default `px/%/rem/em/vw/vh`).
 * Entries that are not dimensional CSS units (e.g. `auto`, `fill`,
 * `fit`, `min-content`) are treated as SEMANTIC keywords: selecting
 * one stores the bare keyword (never a fake `0auto` number) and the
 * numeric input empties + disables. Switching back to a dimensional
 * unit restores the last numeric value the user had, preserving valid
 * values across unit changes instead of silently coercing.
 *
 * Values that don't parse as `<number><unit>` or a known keyword
 * (e.g. `calc(100% - 2rem)`) fall back to a plain text input rather
 * than destroying the expression — no silent coercion, ever.
 */

import { type ReactNode, useCallback, useMemo, useRef } from "react";

import { Input } from "@/primitives/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/primitives/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import { useLocalFieldValue } from "./use-local-field-value";

/** Default unit set when the field metadata declares none. */
const DEFAULT_UNITS: readonly string[] = ["px", "%", "rem", "em", "vw", "vh"];

/**
 * Dimensional CSS units a number can precede. Anything in `units`
 * outside this list is a semantic keyword (`auto`, `fill`, `fit`,
 * `min-content`, …) stored as the bare value.
 */
const DIMENSIONAL_UNITS: ReadonlySet<string> = new Set([
	"px",
	"%",
	"rem",
	"em",
	"vw",
	"vh",
	"vmin",
	"vmax",
	"ch",
	"ex",
	"pt",
	"fr",
	"s",
	"ms",
	"deg",
]);

const NUMBER_WITH_UNIT = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;

export interface ParsedDimension {
	readonly kind: "number" | "keyword" | "empty" | "opaque";
	readonly amount?: string;
	readonly unit?: string;
	readonly keyword?: string;
}

/** Parse a stored dimension string against the field's unit set. */
export function parseDimension(
	value: string | undefined,
	units: readonly string[],
): ParsedDimension {
	const trimmed = (value ?? "").trim();
	if (trimmed.length === 0) return { kind: "empty" };
	const keyword = units.find(
		(unit) => !DIMENSIONAL_UNITS.has(unit) && unit === trimmed,
	);
	if (keyword !== undefined) return { kind: "keyword", keyword };
	const match = NUMBER_WITH_UNIT.exec(trimmed);
	if (match !== null) {
		const [, amount = "", unit = ""] = match;
		if (unit.length === 0 || DIMENSIONAL_UNITS.has(unit.toLowerCase())) {
			return { kind: "number", amount, unit: unit.toLowerCase() };
		}
	}
	// `calc(...)`, custom keywords outside the unit list, etc. —
	// preserved verbatim through the plain-text fallback.
	return { kind: "opaque" };
}

export interface DimensionControlProps {
	readonly id?: string;
	readonly name: string;
	/** Accessible name for the numeric input (the field label). */
	readonly label: string;
	readonly value: string | undefined;
	readonly units?: readonly string[];
	readonly placeholder?: string;
	readonly readOnly?: boolean;
	readonly describedBy?: string;
	readonly onCommit: (next: string) => void;
}

export function DimensionControl({
	id,
	name,
	label,
	value,
	units = DEFAULT_UNITS,
	placeholder,
	readOnly,
	describedBy,
	onCommit,
}: DimensionControlProps): ReactNode {
	const msg = useMsg();
	const parsed = useMemo(() => parseDimension(value, units), [value, units]);

	const dimensionalUnits = useMemo(
		() => units.filter((unit) => DIMENSIONAL_UNITS.has(unit)),
		[units],
	);
	const fallbackUnit = dimensionalUnits[0] ?? "px";

	// The unit the numeric part combines with. While the value is a
	// keyword (or empty), remember the last dimensional unit + amount so
	// switching back from `auto` restores `100px` instead of inventing
	// a value.
	const lastUnitRef = useRef<string>(fallbackUnit);
	const lastAmountRef = useRef<string>("");
	if (parsed.kind === "number") {
		if (parsed.unit !== undefined && parsed.unit.length > 0) {
			lastUnitRef.current = parsed.unit;
		}
		lastAmountRef.current = parsed.amount ?? "";
	}
	const activeUnit =
		parsed.kind === "number" && parsed.unit !== undefined && parsed.unit !== ""
			? parsed.unit
			: lastUnitRef.current;

	// Focus-aware buffer for the numeric input: display just the number,
	// commit `<number><unit>` (or `""` when cleared), tolerate
	// intermediate states like `"1."` without committing.
	const parse = useCallback(
		(raw: string): { ok: true; value: string } | { ok: false } => {
			const trimmed = raw.trim();
			if (trimmed.length === 0) return { ok: true, value: "" };
			return NUMBER_WITH_UNIT.exec(trimmed)?.[2] === ""
				? { ok: true, value: `${trimmed}${lastUnitRef.current}` }
				: { ok: false };
		},
		[],
	);
	const format = useCallback(
		(full: string) => {
			const p = parseDimension(full, units);
			return p.kind === "number" ? (p.amount ?? "") : "";
		},
		[units],
	);
	const { displayValue, onInputChange, onFocus, onBlur } =
		useLocalFieldValue<string>(value ?? "", parse, format, onCommit);

	const handleUnitChange = useCallback(
		(next: string | null): void => {
			if (readOnly === true || next === null) return;
			if (!DIMENSIONAL_UNITS.has(next)) {
				// Semantic keyword — stored bare, numeric part parked.
				onCommit(next);
				return;
			}
			lastUnitRef.current = next;
			const amount =
				parsed.kind === "number"
					? (parsed.amount ?? "")
					: lastAmountRef.current;
			// No number to combine with yet — leave the value untouched
			// until the user types one (never coerce to a fake `0`).
			if (amount.length > 0) onCommit(`${amount}${next}`);
		},
		[readOnly, parsed, onCommit],
	);

	// Unparseable expressions (calc(), unknown keywords) keep a plain
	// text input so the control can never destroy a value it does not
	// understand.
	if (parsed.kind === "opaque") {
		return (
			<Input
				id={id}
				name={name}
				type="text"
				value={value ?? ""}
				placeholder={placeholder}
				readOnly={readOnly}
				aria-describedby={describedBy}
				data-testid="ak-dimension-opaque"
				onChange={(event) => {
					if (readOnly === true) return;
					onCommit(event.target.value);
				}}
			/>
		);
	}

	const selectValue =
		parsed.kind === "keyword" ? (parsed.keyword ?? null) : activeUnit;
	const selectItems = units.map((unit) => ({ label: unit, value: unit }));

	return (
		<InputGroup data-testid="ak-dimension-control">
			<InputGroupInput
				id={id}
				name={name}
				type="text"
				inputMode="decimal"
				className="tabular-nums"
				value={parsed.kind === "keyword" ? "" : displayValue}
				placeholder={parsed.kind === "keyword" ? parsed.keyword : placeholder}
				readOnly={readOnly}
				disabled={parsed.kind === "keyword"}
				aria-label={label}
				aria-describedby={describedBy}
				onFocus={onFocus}
				onBlur={onBlur}
				onChange={(event) => {
					if (readOnly === true) return;
					onInputChange(event.target.value);
				}}
			/>
			<InputGroupAddon align="inline-end" className="p-0">
				<Select
					items={selectItems}
					value={units.includes(selectValue ?? "") ? selectValue : null}
					onValueChange={handleUnitChange}
					disabled={readOnly}
					name={`${name}-unit`}
				>
					<SelectTrigger
						size="sm"
						aria-label={msg("studio.field.dimension.unit")}
						className="h-6 min-w-14 border-0 bg-transparent pr-1 pl-1.5 text-xs text-[var(--ak-studio-muted-fg)] shadow-none dark:bg-transparent"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{units.map((unit) => (
							<SelectItem key={unit} value={unit}>
								{unit}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</InputGroupAddon>
		</InputGroup>
	);
}
