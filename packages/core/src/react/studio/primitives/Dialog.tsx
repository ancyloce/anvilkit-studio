/**
 * @file Internal `<Dialog>` primitive — modal overlay for confirms.
 *
 * Surface-level wrappers over Base UI's compound dialog parts. Used
 * by the chrome for destructive confirmations and unsaved-changes
 * prompts.
 */

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const Root = BaseDialog.Root;
const Trigger = BaseDialog.Trigger;
const Close = BaseDialog.Close;
const Portal = BaseDialog.Portal;

const Backdrop = forwardRef(function DialogBackdrop(
	{ className, ...rest }: ComponentProps<typeof BaseDialog.Backdrop>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseDialog.Backdrop
			ref={ref}
			className={cn(
				"fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
				className,
			)}
			{...rest}
		/>
	);
});

const Popup = forwardRef(function DialogPopup(
	{ className, ...rest }: ComponentProps<typeof BaseDialog.Popup>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseDialog.Popup
			ref={ref}
			className={cn(
				"fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
				"rounded-lg border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-4 text-[var(--ak-studio-panel-fg)] shadow-lg",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
				className,
			)}
			{...rest}
		/>
	);
});

const Title = forwardRef(function DialogTitle(
	{ className, ...rest }: ComponentProps<typeof BaseDialog.Title>,
	ref: Ref<HTMLHeadingElement>,
) {
	return (
		<BaseDialog.Title
			ref={ref}
			className={cn("mb-1 text-base font-semibold", className)}
			{...rest}
		/>
	);
});

const Description = forwardRef(function DialogDescription(
	{ className, ...rest }: ComponentProps<typeof BaseDialog.Description>,
	ref: Ref<HTMLParagraphElement>,
) {
	return (
		<BaseDialog.Description
			ref={ref}
			className={cn(
				"mb-3 text-sm text-[var(--ak-studio-muted-fg)]",
				className,
			)}
			{...rest}
		/>
	);
});

export const Dialog = {
	Root,
	Trigger,
	Close,
	Portal,
	Backdrop,
	Popup,
	Title,
	Description,
} as const;
