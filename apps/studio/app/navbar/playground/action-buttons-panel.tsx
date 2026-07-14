import type { NavbarAction } from "@anvilkit/navbar";
import { Button } from "@anvilkit/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import type { Dispatch, SetStateAction } from "react";
import {
	ControlField,
	createEditableAction,
	type EditableAction,
	selectClassName,
	ToggleField,
} from "../playground";

const variantOptions: Array<NonNullable<NavbarAction["variant"]>> = [
	"default",
	"secondary",
	"outline",
	"ghost",
	"link",
	"destructive",
];

const sizeOptions: Array<NonNullable<NavbarAction["size"]>> = [
	"sm",
	"default",
	"lg",
];

export function NavbarPlaygroundActionButtons({
	editableActions,
	onEditableActionsChange,
}: {
	editableActions: EditableAction[];
	onEditableActionsChange: Dispatch<SetStateAction<EditableAction[]>>;
}) {
	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader className="border-b border-border/70">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle>Action Buttons</CardTitle>
						<CardDescription>
							Control the right-side CTAs, including variant, size, and disabled
							state.
						</CardDescription>
					</div>
					<Button
						onClick={() =>
							onEditableActionsChange((current) => [
								...current,
								createEditableAction({
									href: `/action-${current.length + 1}`,
									label: `Action ${current.length + 1}`,
								}),
							])
						}
						size="sm"
						type="button"
						variant="secondary"
					>
						Add action
					</Button>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4 pt-4">
				{editableActions.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
						No actions configured. Add one or more buttons to populate the right
						section.
					</div>
				) : (
					editableActions.map((action, index) => (
						<div
							key={action.id}
							className="grid gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-foreground">
										Action {index + 1}
									</p>
									<p className="text-xs text-muted-foreground">
										Keep button copy short so the cluster stays balanced.
									</p>
								</div>
								<Button
									onClick={() =>
										onEditableActionsChange((current) =>
											current.filter((entry) => entry.id !== action.id),
										)
									}
									size="sm"
									type="button"
									variant="ghost"
								>
									Remove
								</Button>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<ControlField label="Label">
									<Input
										onChange={(event) =>
											onEditableActionsChange((current) =>
												current.map((entry) =>
													entry.id === action.id
														? {
																...entry,
																label: event.currentTarget.value,
															}
														: entry,
												),
											)
										}
										value={action.label}
									/>
								</ControlField>

								<ControlField label="Href">
									<Input
										onChange={(event) =>
											onEditableActionsChange((current) =>
												current.map((entry) =>
													entry.id === action.id
														? {
																...entry,
																href: event.currentTarget.value,
															}
														: entry,
												),
											)
										}
										value={action.href ?? ""}
									/>
								</ControlField>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<ControlField label="Variant">
									<select
										className={selectClassName}
										onChange={(event) =>
											onEditableActionsChange((current) =>
												current.map((entry) =>
													entry.id === action.id
														? {
																...entry,
																variant: event.currentTarget
																	.value as NonNullable<
																	NavbarAction["variant"]
																>,
															}
														: entry,
												),
											)
										}
										value={action.variant ?? "secondary"}
									>
										{variantOptions.map((variant) => (
											<option key={variant} value={variant}>
												{variant}
											</option>
										))}
									</select>
								</ControlField>

								<ControlField label="Size">
									<select
										className={selectClassName}
										onChange={(event) =>
											onEditableActionsChange((current) =>
												current.map((entry) =>
													entry.id === action.id
														? {
																...entry,
																size: event.currentTarget.value as NonNullable<
																	NavbarAction["size"]
																>,
															}
														: entry,
												),
											)
										}
										value={action.size ?? "lg"}
									>
										{sizeOptions.map((size) => (
											<option key={size} value={size}>
												{size}
											</option>
										))}
									</select>
								</ControlField>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								<ToggleField
									checked={Boolean(action.disabled)}
									label="Disabled"
									onChange={(checked) =>
										onEditableActionsChange((current) =>
											current.map((entry) =>
												entry.id === action.id
													? {
															...entry,
															disabled: checked,
														}
													: entry,
											),
										)
									}
								/>
								<ToggleField
									checked={Boolean(action.openInNewTab)}
									label="Open in new tab"
									onChange={(checked) =>
										onEditableActionsChange((current) =>
											current.map((entry) =>
												entry.id === action.id
													? {
															...entry,
															openInNewTab: checked,
														}
													: entry,
											),
										)
									}
								/>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	);
}
