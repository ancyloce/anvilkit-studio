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

const LUCIDE_EXPORTS = Icons as unknown as Record<string, unknown>;

function isLucideIconComponent(
	candidate: unknown,
): candidate is LucideIconComponent {
	// Lucide icons are React forwardRef components (objects with `$$typeof`).
	// The `createLucideIcon` factory is a plain function and is the only
	// non-component export — exclude it by requiring the object form.
	return typeof candidate === "object" && candidate !== null;
}

function normalizeIconName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function toPascalCase(name: string): string {
	return name
		.split(/[-_\s]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function resolveIcon(name: string | undefined): LucideIconComponent | null {
	const trimmed = name?.trim();
	if (trimmed === undefined || trimmed.length === 0) return null;

	for (const candidateName of [trimmed, toPascalCase(trimmed)]) {
		const candidate = LUCIDE_EXPORTS[candidateName];
		if (isLucideIconComponent(candidate)) {
			return candidate;
		}
	}

	const normalized = normalizeIconName(trimmed);
	for (const [exportName, candidate] of Object.entries(LUCIDE_EXPORTS)) {
		if (
			normalizeIconName(exportName) === normalized &&
			isLucideIconComponent(candidate)
		) {
			return candidate;
		}
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
