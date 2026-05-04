/**
 * @file Default renderer for Puck `array` fields.
 *
 * Renders one card per array item with add / remove / duplicate /
 * reorder controls, then mounts the original `children` (Puck's
 * per-item field tree) so nested fields stay native.
 *
 * The acceptance criterion calls out that add/remove/duplicate/
 * reorder must preserve item identity — we never `.map()` to new
 * objects; mutations are slice/splice on the existing array refs.
 */

import type {
	ArrayField as PuckArrayField,
	FieldProps,
} from "@puckeditor/core";
import {
	ArrowDown,
	ArrowUp,
	Copy,
	Plus,
	Trash2,
} from "lucide-react";
import {
	Children,
	type ReactNode,
	isValidElement,
} from "react";

import { Button } from "../../../studio/primitives/button.js";

import type { FieldRendererProps } from "./TextField.js";

type ArrayValue = readonly Record<string, unknown>[];

interface ArrayFieldRendererProps
	extends FieldProps<
		PuckArrayField<Record<string, unknown>[]>,
		ArrayValue | undefined
	> {
	readonly name: string;
	readonly children: ReactNode;
}

function toArray(value: ArrayValue | undefined): ArrayValue {
	return value ?? [];
}

function defaultItemAt(
	field: PuckArrayField<Record<string, unknown>[]>,
	index: number,
): Record<string, unknown> {
	const factory = field.defaultItemProps;
	if (typeof factory === "function") {
		return factory(index);
	}
	if (factory !== undefined) {
		return factory;
	}
	return {};
}

export function ArrayField({
	field,
	value,
	onChange,
	readOnly,
	children,
}: ArrayFieldRendererProps): ReactNode {
	const items = toArray(value);
	const childArray = Children.toArray(children).filter(isValidElement);

	const min = field.min ?? 0;
	const max = field.max ?? Number.POSITIVE_INFINITY;

	function update(next: ArrayValue): void {
		if (readOnly === true) return;
		onChange(next as never);
	}

	function add(): void {
		if (items.length >= max) return;
		update([...items, defaultItemAt(field, items.length)]);
	}

	function remove(index: number): void {
		if (items.length <= min) return;
		update(items.filter((_, i) => i !== index));
	}

	function duplicate(index: number): void {
		if (items.length >= max) return;
		const copy = items.slice();
		copy.splice(index + 1, 0, copy[index] as Record<string, unknown>);
		update(copy);
	}

	function move(from: number, to: number): void {
		if (to < 0 || to >= items.length) return;
		const copy = items.slice();
		const [moved] = copy.splice(from, 1);
		if (moved !== undefined) {
			copy.splice(to, 0, moved);
		}
		update(copy);
	}

	return (
		<div className="flex flex-col gap-1.5">
			{items.map((_item, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: array fields are reordered by index, not by item id; the index IS the identity here.
					key={index}
					className="rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-2"
				>
					<div className="mb-1.5 flex items-center justify-between gap-2">
						<span className="text-xs font-medium text-[var(--ak-studio-muted-fg)]">
							{field.getItemSummary?.(items[index] ?? {}, index) ??
								`Item ${index + 1}`}
						</span>
						{readOnly !== true ? (
							<div className="flex items-center gap-0.5">
								<Button
									variant="ghost"
									size="icon"
									aria-label="Move up"
									disabled={index === 0}
									onClick={() => move(index, index - 1)}
								>
									<ArrowUp />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Move down"
									disabled={index === items.length - 1}
									onClick={() => move(index, index + 1)}
								>
									<ArrowDown />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Duplicate"
									disabled={items.length >= max}
									onClick={() => duplicate(index)}
								>
									<Copy />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove"
									disabled={items.length <= min}
									onClick={() => remove(index)}
								>
									<Trash2 />
								</Button>
							</div>
						) : null}
					</div>
					{childArray[index] ?? null}
				</div>
			))}
			{readOnly !== true ? (
				<Button
					variant="outline"
					size="sm"
					disabled={items.length >= max}
					onClick={add}
				>
					<Plus />
					<span>Add item</span>
				</Button>
			) : null}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
