import * as React from "react";

import { cn } from "@anvilkit/ui/lib/utils";

/**
 * shadcn-style `field` primitives (base-nova).
 *
 * Composition: `FieldGroup` stacks one or more `Field`s; each `Field`
 * holds a `FieldLabel` + control (`Input`, `Switch`, …) and an
 * optional `FieldDescription`. Token-only styling so it stays
 * theme-aware. Exposed at `@anvilkit/ui/field` via the package's
 * `./*` export wildcard.
 */

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="field-group"
			className={cn("grid gap-3", className)}
			{...props}
		/>
	);
}

function Field({
	className,
	orientation = "vertical",
	...props
}: React.ComponentProps<"div"> & {
	orientation?: "vertical" | "horizontal";
}) {
	return (
		<div
			role="group"
			data-slot="field"
			data-orientation={orientation}
			className={cn(
				"grid gap-1",
				orientation === "horizontal" &&
					"grid-cols-[1fr_auto] items-center gap-3",
				className,
			)}
			{...props}
		/>
	);
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
	return (
		<label
			data-slot="field-label"
			className={cn(
				"text-xs font-medium text-foreground/70 select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="field-description"
			className={cn("text-xs text-muted-foreground", className)}
			{...props}
		/>
	);
}

export { Field, FieldGroup, FieldLabel, FieldDescription };
