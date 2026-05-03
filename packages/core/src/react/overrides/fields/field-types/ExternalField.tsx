/**
 * @file Default renderer for Puck `external` fields.
 *
 * v1 surfaces a "Pick item…" button that opens a popover containing
 * an async-loaded list. The full table-style picker from Puck's
 * reference impl is deferred — most consumers wire their own
 * external pickers via field-config callbacks.
 */

import type {
	ExternalField as PuckExternalField,
	FieldProps,
} from "@puckeditor/core";
import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "../../../studio/primitives/Button.js";
import { Input } from "../../../studio/primitives/Input.js";
import { ScrollArea } from "../../../studio/primitives/ScrollArea.js";

import type { FieldRendererProps } from "./TextField.js";

interface ExternalFieldRendererProps
	extends FieldProps<
		PuckExternalField<Record<string, unknown>>,
		Record<string, unknown> | null | undefined
	> {
	readonly name: string;
	readonly children?: ReactNode;
}

interface ExternalRow {
	readonly raw: unknown;
	readonly mapped: Record<string, unknown>;
	readonly summary: string;
}

function asString(input: unknown): string {
	if (typeof input === "string") return input;
	if (typeof input === "number" || typeof input === "boolean")
		return String(input);
	return "";
}

function summarize(row: unknown): string {
	if (row === null || typeof row !== "object") return asString(row);
	const obj = row as Record<string, unknown>;
	return (
		asString(obj.title) ||
		asString(obj.label) ||
		asString(obj.name) ||
		asString(obj.id) ||
		"(item)"
	);
}

export function ExternalField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: ExternalFieldRendererProps): ReactNode {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [rows, setRows] = useState<ExternalRow[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		void (async () => {
			try {
				const result = (await field.fetchList({
					query,
					filters: {},
				})) as unknown[] | null;
				if (cancelled) return;
				const next = (result ?? []).map((raw) => {
					const mapped =
						field.mapProp !== undefined
							? (field.mapProp(raw as Record<string, unknown>) as Record<
									string,
									unknown
								>)
							: (raw as Record<string, unknown>);
					return {
						raw,
						mapped,
						summary: summarize(raw),
					} satisfies ExternalRow;
				});
				setRows(next);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, query, field]);

	const summary =
		value === null || value === undefined
			? null
			: (field.getItemSummary?.(value, undefined) as ReactNode | undefined) ??
				summarize(value);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<Button
					id={id}
					variant="outline"
					size="sm"
					disabled={readOnly}
					onClick={() => setOpen((p) => !p)}
				>
					<span>{summary === null ? (field.placeholder ?? "Select…") : summary}</span>
					<ChevronDown />
				</Button>
				{value !== null && value !== undefined && readOnly !== true ? (
					<Button
						variant="ghost"
						size="icon"
						aria-label="Clear"
						onClick={() => onChange(null as never)}
					>
						<X />
					</Button>
				) : null}
			</div>
			{open ? (
				<div className="rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-2">
					{field.showSearch !== false ? (
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search…"
							name={`${name}-search`}
						/>
					) : null}
					<ScrollArea className="mt-2 max-h-48" viewportClassName="px-1">
						{loading ? (
							<p className="px-1 py-2 text-xs text-[var(--ak-studio-muted-fg)]">
								Loading…
							</p>
						) : rows.length === 0 ? (
							<p className="px-1 py-2 text-xs text-[var(--ak-studio-muted-fg)]">
								No results.
							</p>
						) : (
							<ul className="flex flex-col">
								{rows.map((row, index) => (
									<li key={index}>
										<button
											type="button"
											className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-[var(--ak-studio-muted)]"
											onClick={() => {
												onChange(row.mapped as never);
												setOpen(false);
											}}
										>
											{row.summary}
										</button>
									</li>
								))}
							</ul>
						)}
					</ScrollArea>
				</div>
			) : null}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
