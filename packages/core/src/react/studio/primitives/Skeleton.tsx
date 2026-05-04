/**
 * @file Internal `<Skeleton>` primitive — loading placeholder.
 *
 * Token-aware shimmering block used while sidebar modules wait for
 * data (asset thumbnails, layer tree paint, etc.). Three shape
 * variants cover every Phase B–F call site without requiring per-use
 * className overrides.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const skeletonVariants = cva(
	[
		"animate-pulse bg-[var(--ak-studio-muted)]",
		"motion-reduce:animate-none",
	],
	{
		variants: {
			shape: {
				rect: "rounded-md",
				circle: "rounded-full",
				text: "h-3 w-full rounded-sm",
			},
		},
		defaultVariants: {
			shape: "rect",
		},
	},
);

export type SkeletonVariants = VariantProps<typeof skeletonVariants>;

export interface SkeletonProps
	extends ComponentProps<"div">,
		SkeletonVariants {}

export const Skeleton = forwardRef(function Skeleton(
	{ className, shape, ...rest }: SkeletonProps,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<div
			ref={ref}
			role="status"
			aria-busy="true"
			aria-live="polite"
			className={cn(skeletonVariants({ shape }), className)}
			{...rest}
		/>
	);
});
