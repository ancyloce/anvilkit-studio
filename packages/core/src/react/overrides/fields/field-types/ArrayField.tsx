/**
 * @file Default renderer for Puck `array` fields.
 *
 * Renders a sortable row list for array items. Selecting a row opens
 * that item's configured `arrayFields` in an animated popover, so item
 * edits happen in a property panel instead of a second array list.
 *
 * The acceptance criterion calls out that add/remove/duplicate/
 * reorder must preserve item identity — we never `.map()` to new
 * objects; mutations are slice/splice on the existing array refs.
 */

import type {
	Field,
	FieldProps,
	ArrayField as PuckArrayField,
} from "@puckeditor/core";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import { Button } from "@/primitives/button";
import { Card, CardContent } from "@/primitives/card";
import { Item, ItemActions, ItemContent } from "@/primitives/item";
import {
	Popover,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTitle,
	PopoverTrigger,
} from "@/primitives/animate-ui/primitives/base/popover";
import { ScrollArea } from "@/primitives/scroll-area";
import { cn } from "@/utils/cn";

import { FieldLabel } from "../../layout/FieldLabel";
import { ExternalField } from "./ExternalField";
import { NumberField } from "./NumberField";
import { RadioField } from "./RadioField";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

type ArrayValue = readonly Record<string, unknown>[];

const ARRAY_ITEM_DRAG_TYPE = "application/x-anvilkit-array-item";
const PROPERTY_PANEL_HEIGHT = "16rem";
const PROPERTY_PANEL_MAX_HEIGHT = `min(${PROPERTY_PANEL_HEIGHT}, var(--available-height, ${PROPERTY_PANEL_HEIGHT}))`;

interface ArrayFieldRendererProps
	extends FieldProps<
		PuckArrayField<Record<string, unknown>[]>,
		ArrayValue | undefined
	> {
	readonly id?: string;
	readonly name?: string;
	readonly children?: ReactNode;
}

type ChangeUiState = Parameters<ArrayFieldRendererProps["onChange"]>[1];
type ItemField = Field;
type ObjectItemField = Extract<ItemField, { type: "object" }>;

function toArray(value: ArrayValue | undefined): ArrayValue {
	return value ?? [];
}

function toRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
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

function getItemSummary(
	field: PuckArrayField<Record<string, unknown>[]>,
	item: Record<string, unknown>,
	index: number,
): ReactNode {
	return field.getItemSummary?.(item, index) ?? `Item ${index + 1}`;
}

function summaryToText(summary: ReactNode, index: number): string {
	if (typeof summary === "string" || typeof summary === "number") {
		return String(summary);
	}
	return `Item ${index + 1}`;
}

function withFallbackLabel<F extends ItemField>(field: F, label: string): F {
	if (field.label !== undefined) {
		return field;
	}
	return { ...field, label } as F;
}

function getDragIndex(
	dataTransfer: DataTransfer,
	fallback: number | null,
): number | null {
	if (fallback !== null) return fallback;
	const raw =
		dataTransfer.getData(ARRAY_ITEM_DRAG_TYPE) ||
		dataTransfer.getData("text/plain");
	if (raw.trim() === "") return null;
	const index = Number(raw);
	return Number.isInteger(index) ? index : null;
}

interface NestedFieldProps {
	readonly field: ItemField;
	readonly value: unknown;
	readonly onChange: (value: unknown, uiState?: ChangeUiState) => void;
	readonly readOnly?: boolean;
	readonly id: string;
	readonly name: string;
}

function NestedField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: NestedFieldProps): ReactNode {
	if (field.visible === false) {
		return null;
	}

	switch (field.type) {
		case "text":
			return (
				<TextField
					field={field}
					value={value as string | undefined}
					onChange={onChange}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "textarea":
			return (
				<TextareaField
					field={field}
					value={value as string | undefined}
					onChange={onChange}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "number":
			return (
				<NumberField
					field={field}
					value={typeof value === "number" ? value : undefined}
					onChange={onChange}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "select":
			return (
				<SelectField
					field={field}
					value={value as never}
					onChange={onChange}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "radio":
			return (
				<RadioField
					field={field}
					value={value as never}
					onChange={onChange}
					readOnly={readOnly}
					name={name}
				/>
			);
		case "external":
			return (
				<ExternalField
					field={field as never}
					value={value as Record<string, unknown> | null | undefined}
					onChange={onChange as never}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "array":
			return (
				<ArrayField
					field={field as PuckArrayField<Record<string, unknown>[]>}
					value={Array.isArray(value) ? (value as ArrayValue) : []}
					onChange={onChange as never}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "object":
			return (
				<InlineObjectField
					field={field}
					value={value}
					onChange={onChange}
					readOnly={readOnly}
					id={id}
					name={name}
				/>
			);
		case "slot":
		case "custom":
		case "richtext":
			return null;
		default:
			return null;
	}
}

function InlineObjectField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: NestedFieldProps & { readonly field: ObjectItemField }): ReactNode {
	const objectValue = toRecord(value);

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="object"
			el="div"
			readOnly={readOnly}
		>
			<Card size="sm" className={cn(readOnly === true && "opacity-70")}>
				<CardContent className="flex flex-col gap-3">
					{Object.entries(field.objectFields).map(([subName, subField]) => {
						const nestedField = withFallbackLabel(
							subField as ItemField,
							subName,
						);
						const subId = `${id}_${subName}`;
						const subPath = `${name}.${subName}`;

						return (
							<NestedField
								key={subPath}
								field={nestedField}
								value={objectValue[subName]}
								onChange={(nextValue, uiState) => {
									if (objectValue[subName] === nextValue) return;
									onChange({ ...objectValue, [subName]: nextValue }, uiState);
								}}
								readOnly={readOnly}
								id={subId}
								name={subPath}
							/>
						);
					})}
				</CardContent>
			</Card>
		</FieldLabel>
	);
}

interface ItemFieldsPanelProps {
	readonly field: PuckArrayField<Record<string, unknown>[]>;
	readonly fieldName: string;
	readonly item: Record<string, unknown>;
	readonly index: number;
	readonly summaryText: string;
	readonly readOnly?: boolean;
	readonly id?: string;
	readonly onItemChange: (
		index: number,
		subName: string,
		value: unknown,
		uiState?: ChangeUiState,
	) => void;
}

function ItemFieldsPanel({
	field,
	fieldName,
	item,
	index,
	summaryText,
	readOnly,
	id,
	onItemChange,
}: ItemFieldsPanelProps): ReactNode {
	return (
		<fieldset className="flex min-w-0 flex-col gap-3" disabled={readOnly}>
			<legend className="sr-only">{summaryText}</legend>
			{Object.entries(field.arrayFields).map(([subName, subField]) => {
				const nestedField = withFallbackLabel(subField as ItemField, subName);
				const subId = `${id ?? fieldName}_${index}_${subName}`;
				const subPath = `${fieldName}[${index}].${subName}`;

				return (
					<NestedField
						key={subPath}
						field={nestedField}
						value={item[subName]}
						onChange={(nextValue, uiState) =>
							onItemChange(index, subName, nextValue, uiState)
						}
						readOnly={readOnly}
						id={subId}
						name={subPath}
					/>
				);
			})}
		</fieldset>
	);
}

export function ArrayField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: ArrayFieldRendererProps): ReactNode {
	const items = toArray(value);
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const fieldName = name ?? id ?? "items";

	const min = field.min ?? 0;
	const max = field.max ?? Number.POSITIVE_INFINITY;

	useEffect(() => {
		// `>=`, not `>`: when an external update shrinks a 3-item array
		// to 2 while index 2 is open, `2 > 2` is false but index 2 is no
		// longer a valid item, so the stale panel must still close.
		if (openIndex !== null && openIndex >= items.length) {
			setOpenIndex(null);
		}
	}, [items.length, openIndex]);

	function update(next: ArrayValue, uiState?: ChangeUiState): void {
		if (readOnly === true) return;
		onChange(next as never, uiState);
	}

	function updateItem(
		index: number,
		subName: string,
		nextValue: unknown,
		uiState?: ChangeUiState,
	): void {
		const item = items[index];
		if (item === undefined || item[subName] === nextValue) return;
		const copy = items.slice();
		copy[index] = { ...item, [subName]: nextValue };
		update(copy, uiState);
	}

	function add(): void {
		if (readOnly === true || items.length >= max) return;
		setOpenIndex(items.length);
		update([...items, defaultItemAt(field, items.length)]);
	}

	function remove(index: number): void {
		if (readOnly === true || items.length <= min) return;
		update(items.filter((_, i) => i !== index));
		setOpenIndex((current) => {
			if (current === null) return null;
			if (current === index) return null;
			if (current > index) return current - 1;
			return current;
		});
	}

	function duplicate(index: number): void {
		if (readOnly === true || items.length >= max) return;
		const copy = items.slice();
		copy.splice(index + 1, 0, copy[index] as Record<string, unknown>);
		setOpenIndex(index + 1);
		update(copy);
	}

	function move(from: number, to: number): void {
		if (readOnly === true || from === to || to < 0 || to >= items.length) {
			return;
		}
		const copy = items.slice();
		const [moved] = copy.splice(from, 1);
		if (moved !== undefined) {
			copy.splice(to, 0, moved);
		}
		setOpenIndex((current) => {
			if (current === null) return null;
			if (current === from) return to;
			if (from < to && current > from && current <= to) return current - 1;
			if (to < from && current >= to && current < from) return current + 1;
			return current;
		});
		update(copy);
	}

	function handleDragStart(
		event: DragEvent<HTMLButtonElement>,
		index: number,
	): void {
		if (readOnly === true || items.length < 2) return;
		setDraggedIndex(index);
		setDropIndex(index);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData(ARRAY_ITEM_DRAG_TYPE, String(index));
		event.dataTransfer.setData("text/plain", String(index));
	}

	function handleDragOver(
		event: DragEvent<HTMLDivElement>,
		index: number,
	): void {
		if (readOnly === true) return;
		const from = getDragIndex(event.dataTransfer, draggedIndex);
		if (from === null || from === index) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		setDropIndex(index);
	}

	function handleDrop(event: DragEvent<HTMLDivElement>, index: number): void {
		if (readOnly === true) return;
		event.preventDefault();
		const from = getDragIndex(event.dataTransfer, draggedIndex);
		if (from !== null) {
			move(from, index);
		}
		setDraggedIndex(null);
		setDropIndex(null);
	}

	function handleDragEnd(): void {
		setDraggedIndex(null);
		setDropIndex(null);
	}

	function handleHandleKeyDown(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	): void {
		if (readOnly === true) return;
		if (event.key === "ArrowUp") {
			event.preventDefault();
			move(index, index - 1);
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			move(index, index + 1);
		}
	}

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? fieldName}
			type="array"
			el="div"
			readOnly={readOnly}
		>
			<div className="flex flex-col gap-3" role="list">
				{items.map((item, index) => {
					const summary = getItemSummary(field, item, index);
					const summaryText = summaryToText(summary, index);
					const canReorder = readOnly !== true && items.length > 1;

					return (
						<Popover
							// biome-ignore lint/suspicious/noArrayIndexKey: array fields are reordered by index, not by item id; the index IS the identity here.
							key={index}
							open={openIndex === index}
							onOpenChange={(open) => {
								setOpenIndex((current) => {
									if (open) return index;
									if (current === index) return null;
									return current;
								});
							}}
						>
							<Item
								role="listitem"
								variant="outline"
								size="xs"
								className={cn(
									openIndex === index && "border-ring",
									draggedIndex === index && "opacity-60",
									dropIndex === index &&
										draggedIndex !== index &&
										"border-ring bg-muted/50",
								)}
								onDragOver={(event) => handleDragOver(event, index)}
								onDrop={(event) => handleDrop(event, index)}
							>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={`Reorder ${summaryText}`}
									disabled={!canReorder}
									draggable={canReorder}
									className={cn(
										"text-muted-foreground hover:text-foreground",
										canReorder && "cursor-grab active:cursor-grabbing",
									)}
									onDragStart={(event) => handleDragStart(event, index)}
									onDragEnd={handleDragEnd}
									onKeyDown={(event) => handleHandleKeyDown(event, index)}
								>
									<GripVertical data-icon="inline-start" aria-hidden="true" />
								</Button>

								<ItemContent className="min-w-0 flex-1 self-stretch gap-0">
									<PopoverTrigger
										render={
											<button
												type="button"
												aria-expanded={openIndex === index}
												aria-label={`Edit ${summaryText}`}
												className="flex h-full w-full min-w-0 items-center rounded-md px-1 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
											/>
										}
									>
										<span
											className={cn(
												"truncate",
												openIndex === index && "text-primary",
											)}
										>
											{summary}
										</span>
									</PopoverTrigger>
								</ItemContent>

								{readOnly !== true ? (
									<ItemActions className="shrink-0 gap-0.5">
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="Duplicate"
											disabled={items.length >= max}
											onClick={() => duplicate(index)}
										>
											<Copy data-icon="inline-start" aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="Remove"
											disabled={items.length <= min}
											className="text-destructive hover:bg-destructive/10 hover:text-destructive"
											onClick={() => remove(index)}
										>
											<Trash2 data-icon="inline-start" aria-hidden="true" />
										</Button>
									</ItemActions>
								) : null}
							</Item>

							<PopoverPortal>
								<PopoverPositioner
									side="left"
									align="start"
									sideOffset={68}
									alignOffset={-14}
								>
									<PopoverPopup
										data-ak-studio-theme
										initialFocus={false}
										style={{ maxHeight: PROPERTY_PANEL_MAX_HEIGHT }}
										className="flex min-h-0 w-64 origin-(--transform-origin) flex-col gap-0 overflow-hidden rounded-lg bg-popover p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden"
									>
										<PopoverTitle className="sr-only">
											{summaryText}
										</PopoverTitle>
										<ScrollArea className="max-h-[inherit] min-h-0 w-full flex-auto [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
											<div className="p-4">
												<ItemFieldsPanel
													field={field}
													fieldName={fieldName}
													item={item}
													index={index}
													summaryText={summaryText}
													readOnly={readOnly}
													id={id}
													onItemChange={updateItem}
												/>
											</div>
										</ScrollArea>
									</PopoverPopup>
								</PopoverPositioner>
							</PopoverPortal>
						</Popover>
					);
				})}
				{readOnly !== true ? (
					<Button
						variant="outline"
						size="lg"
						className="w-full"
						disabled={items.length >= max}
						onClick={add}
					>
						<Plus data-icon="inline-start" aria-hidden="true" />
						<span>Add item</span>
					</Button>
				) : null}
			</div>
		</FieldLabel>
	);
}

export type { FieldProps as PuckFieldProps };
