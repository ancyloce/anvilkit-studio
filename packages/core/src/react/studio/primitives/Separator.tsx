/**
 * @file Internal `<Separator>` primitive — horizontal/vertical rule.
 */

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

export type SeparatorProps = ComponentProps<typeof SeparatorPrimitive>;

export const Separator = forwardRef(function Separator(
	{ className, orientation = "horizontal", ...rest }: SeparatorProps,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<SeparatorPrimitive
			ref={ref}
			orientation={orientation}
			className={cn(
				"shrink-0 bg-[var(--ak-studio-border)]",
				orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
				className,
			)}
			{...rest}
		/>
	);
});
