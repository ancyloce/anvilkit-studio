/**
 * @file Internal `<Button>` primitive (PRD §7.3).
 *
 * Tiny Tailwind-styled wrapper over `@base-ui/react/button`.
 * Mirrors `@anvilkit/ui` Button's variant set so the chrome looks
 * consistent with host components, but exposed only inside
 * `@anvilkit/core` — consumers should never reach in here.
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

export type ButtonVariant = "default" | "ghost" | "outline" | "destructive";
export type ButtonSize = "default" | "sm" | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	default:
		"bg-[var(--ak-studio-fg)] text-[var(--ak-studio-bg)] hover:opacity-90",
	ghost: "bg-transparent hover:bg-[var(--ak-studio-muted)]",
	outline:
		"border border-[var(--ak-studio-border)] bg-transparent hover:bg-[var(--ak-studio-muted)]",
	destructive: "bg-red-600 text-white hover:bg-red-700",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
	default: "h-8 px-3 text-sm",
	sm: "h-7 px-2 text-xs",
	icon: "size-8 p-0",
};

const BASE_CLASSES =
	"inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)] " +
	"disabled:pointer-events-none disabled:opacity-50";

export interface ButtonProps extends ComponentProps<typeof ButtonPrimitive> {
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
}

export const Button = forwardRef(function Button(
	{ className, variant = "default", size = "default", ...rest }: ButtonProps,
	ref: Ref<HTMLButtonElement>,
) {
	return (
		<ButtonPrimitive
			ref={ref}
			className={cn(
				BASE_CLASSES,
				VARIANT_CLASSES[variant],
				SIZE_CLASSES[size],
				className,
			)}
			{...rest}
		/>
	);
});
