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
	createEditableItem,
	type EditableItem,
} from "../playground";

export function NavbarPlaygroundNavItems({
	active,
	editableItems,
	onActiveChange,
	onEditableItemsChange,
}: {
	active: string;
	editableItems: EditableItem[];
	onActiveChange: Dispatch<SetStateAction<string>>;
	onEditableItemsChange: Dispatch<SetStateAction<EditableItem[]>>;
}) {
	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader className="border-b border-border/70">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle>Navigation Items</CardTitle>
						<CardDescription>
							Update labels, links, and which item should be marked active.
						</CardDescription>
					</div>
					<Button
						onClick={() =>
							onEditableItemsChange((current) => [
								...current,
								createEditableItem({
									href: `/item-${current.length + 1}`,
									label: `Item ${current.length + 1}`,
								}),
							])
						}
						size="sm"
						type="button"
						variant="secondary"
					>
						Add item
					</Button>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4 pt-4">
				{editableItems.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
						No items configured. Add a link to repopulate the center navigation.
					</div>
				) : (
					editableItems.map((item, index) => (
						<div
							key={item.id}
							className="grid gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-foreground">
										Item {index + 1}
									</p>
									<p className="text-xs text-muted-foreground">
										Configure the label and destination for this link.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										onClick={() => onActiveChange(item.href)}
										size="sm"
										type="button"
										variant={active === item.href ? "secondary" : "outline"}
									>
										{active === item.href ? "Active" : "Set active"}
									</Button>
									<Button
										onClick={() => {
											onEditableItemsChange((current) =>
												current.filter((entry) => entry.id !== item.id),
											);

											if (active === item.href) {
												const fallback = editableItems.find(
													(entry) => entry.id !== item.id,
												);
												onActiveChange(fallback?.href ?? "");
											}
										}}
										size="sm"
										type="button"
										variant="ghost"
									>
										Remove
									</Button>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<ControlField label="Label">
									<Input
										onChange={(event) =>
											onEditableItemsChange((current) =>
												current.map((entry) =>
													entry.id === item.id
														? {
																...entry,
																label: event.currentTarget.value,
															}
														: entry,
												),
											)
										}
										value={item.label}
									/>
								</ControlField>

								<ControlField label="Href">
									<Input
										onChange={(event) => {
											const nextHref = event.currentTarget.value;

											onEditableItemsChange((current) =>
												current.map((entry) =>
													entry.id === item.id
														? {
																...entry,
																href: nextHref,
															}
														: entry,
												),
											);

											if (active === item.href) {
												onActiveChange(nextHref);
											}
										}}
										value={item.href}
									/>
								</ControlField>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	);
}
