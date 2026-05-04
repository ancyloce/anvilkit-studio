/**
 * @file Internal `<Toast>` primitive — sonner-backed transient
 * notifications.
 *
 * `<StudioToaster>` is the host component the chrome mounts once;
 * `studioToast` is the imperative helper modules call to fire a
 * notification (`studioToast.error("Upload failed")`,
 * `studioToast.warning("Select a text element")`).
 *
 * sonner brings its own viewport, focus management, and aria-live
 * region — we theme it through the `--ak-studio-*` tokens via the
 * `toastOptions.classNames` slot rather than overriding sonner's DOM.
 *
 * Uses theme="system" by default — sonner inverts on dark themes via
 * the `dark` class on its container. The chrome's existing token
 * bridge already paints the correct foreground/background.
 */

import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../overrides/utils/cn.js";

export interface StudioToasterProps
	extends Omit<ComponentProps<typeof SonnerToaster>, "theme"> {
	readonly theme?: "light" | "dark" | "system";
}

const TOAST_CLASSNAMES = {
	toast: cn(
		"!border !border-[var(--ak-studio-border)]",
		"!bg-[var(--ak-studio-panel)] !text-[var(--ak-studio-panel-fg)]",
		"!shadow-md",
	),
	title: "!text-[var(--ak-studio-fg)] !font-medium",
	description: "!text-[var(--ak-studio-muted-fg)]",
	actionButton: cn(
		"!bg-[var(--ak-studio-fg)] !text-[var(--ak-studio-bg)]",
	),
	cancelButton: cn(
		"!bg-[var(--ak-studio-muted)] !text-[var(--ak-studio-muted-fg)]",
	),
	error: "!text-red-600 dark:!text-red-400",
	success: "!text-emerald-600 dark:!text-emerald-400",
	warning: "!text-amber-600 dark:!text-amber-400",
	info: "!text-blue-600 dark:!text-blue-400",
} as const;

/**
 * Studio-themed sonner viewport. Mount once at chrome scope; calls to
 * {@link studioToast} target whichever `<StudioToaster>` is currently
 * mounted.
 */
export function StudioToaster({
	className,
	position = "bottom-right",
	theme = "system",
	closeButton = true,
	...rest
}: StudioToasterProps): ReactNode {
	return (
		<SonnerToaster
			className={cn("ak-studio-toaster", className)}
			position={position}
			theme={theme}
			closeButton={closeButton}
			toastOptions={{
				classNames: TOAST_CLASSNAMES,
			}}
			{...rest}
		/>
	);
}

/**
 * Imperative toast handle re-exported from sonner. Module call sites
 * use `studioToast.error(…)` etc. — no need to import sonner directly.
 *
 * Re-exported via the source binding (instead of `export const
 * studioToast = sonnerToast`) so TypeScript does not try to inline
 * sonner's internal types into the emitted declaration file.
 */
export { sonnerToast as studioToast };
