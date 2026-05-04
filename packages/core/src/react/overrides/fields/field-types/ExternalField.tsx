/**
 * @file Default renderer for Puck `external` fields.
 *
 * v1 surfaces a "Pick item…" button that opens a popover containing
 * an async-loaded list. The full table-style picker from Puck's
 * reference impl is deferred — most consumers wire their own
 * external pickers via field-config callbacks.
 */

import type {
	FieldProps,
	ExternalField as PuckExternalField,
} from "@puckeditor/core";
import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/primitives/button";
import { Card, CardContent } from "@/primitives/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/primitives/empty";
import { Input } from "@/primitives/input";
import { ScrollArea } from "@/primitives/scroll-area";
import { Spinner } from "@/primitives/spinner";

import type { FieldRendererProps } from "./TextField";

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

function rowKey(row: ExternalRow): string {
	const raw =
		row.raw !== null && typeof row.raw === "object"
			? (row.raw as Record<string, unknown>)
			: undefined;
	return (
		asString(row.mapped.id) ||
		asString(row.mapped.key) ||
		asString(raw?.id) ||
		asString(raw?.key) ||
		row.summary
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
			: ((field.getItemSummary?.(value, undefined) as ReactNode | undefined) ??
				summarize(value));

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
					<span>
						{summary === null ? (field.placeholder ?? "Select…") : summary}
					</span>
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
				<Card size="sm">
					<CardContent className="flex flex-col gap-2">
						{field.showSearch !== false ? (
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search…"
								name={`${name}-search`}
							/>
						) : null}
						<ScrollArea className="max-h-48">
							{loading ? (
								<Empty className="border-0 p-3">
									<Spinner />
								</Empty>
							) : rows.length === 0 ? (
								<Empty className="border-0 p-3">
									<EmptyTitle>No results</EmptyTitle>
									<EmptyDescription>
										Try a different search term.
									</EmptyDescription>
								</Empty>
							) : (
								<ul className="flex flex-col">
									{rows.map((row) => (
										<li key={rowKey(row)}>
											<Button
												variant="ghost"
												size="sm"
												className="w-full justify-start"
												onClick={() => {
													onChange(row.mapped as never);
													setOpen(false);
												}}
											>
												{row.summary}
											</Button>
										</li>
									))}
								</ul>
							)}
						</ScrollArea>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
