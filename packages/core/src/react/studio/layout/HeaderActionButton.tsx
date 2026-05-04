/**
 * @file Single header action button + overflow-menu item variants.
 *
 * Both variants share the same icon + label resolution logic so the
 * overflow menu and the toolbar render plugin actions identically.
 */

import * as Icons from "lucide-react";
import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useState,
} from "react";
import { Button } from "@/primitives/button";
import { DropdownMenuItem } from "@/primitives/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import type { StudioHeaderAction, StudioPluginContext } from "@/types/plugin";

type LucideIconComponent = ComponentType<{ className?: string }>;

function resolveIcon(name: string | undefined): LucideIconComponent | null {
	if (name === undefined || name.length === 0) return null;
	const candidate = (Icons as unknown as Record<string, unknown>)[name];
	// Lucide icons are React forwardRef components (objects with `$$typeof`).
	// The `createLucideIcon` factory is a plain function and is the only
	// non-component export — exclude it by requiring the object form.
	if (typeof candidate === "object" && candidate !== null) {
		return candidate as LucideIconComponent;
	}
	return null;
}

export interface HeaderActionButtonProps {
	readonly action: StudioHeaderAction;
	readonly ctx: StudioPluginContext;
	readonly variant?: "button" | "menuitem";
}

/**
 * Render one header action. Awaits the (possibly async) `onClick`
 * and routes any throw through `ctx.log("error", …)` so a buggy
 * plugin cannot unmount the chrome (PRD §9.2).
 */
export function HeaderActionButton({
	action,
	ctx,
	variant = "button",
}: HeaderActionButtonProps): ReactNode {
	const [pending, setPending] = useState(false);
	const disabled = action.disabled?.(ctx) === true || pending;

	const handleClick = useCallback(async (): Promise<void> => {
		setPending(true);
		try {
			await action.onClick(ctx);
		} catch (error) {
			ctx.log(
				"error",
				`header action "${action.id}" threw`,
				error instanceof Error
					? { name: error.name, message: error.message, stack: error.stack }
					: { value: String(error) },
			);
		} finally {
			setPending(false);
		}
	}, [action, ctx]);

	const Icon = resolveIcon(action.icon);
	const iconNode = Icon === null ? null : <Icon />;

	if (variant === "menuitem") {
		return (
			<DropdownMenuItem
				disabled={disabled}
				onClick={() => {
					void handleClick();
				}}
			>
				{iconNode}
				<span>{action.label}</span>
			</DropdownMenuItem>
		);
	}

	const buttonVariant = action.group === "primary" ? "default" : "ghost";
	const button = (
		<Button
			variant={buttonVariant}
			size={
				action.icon !== undefined && action.label.length === 0
					? "icon"
					: "default"
			}
			disabled={disabled}
			onClick={() => {
				void handleClick();
			}}
		>
			{iconNode}
			{action.label.length > 0 ? <span>{action.label}</span> : null}
		</Button>
	);

	if (action.icon !== undefined && action.label.length > 0) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={<span className="inline-flex">{button}</span>}
				/>
				<TooltipContent>{action.label}</TooltipContent>
			</Tooltip>
		);
	}
	return button;
}
