/**
 * @file Single header action button + overflow-menu item variants.
 *
 * Both variants share the same icon + label resolution logic so the
 * overflow menu and the toolbar render plugin actions identically.
 */

import {
	Camera,
	Code,
	Download,
	History,
	Monitor,
	Smartphone,
	Sparkles,
	Tablet,
	Upload,
} from "lucide-react";
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

/**
 * Curated set of icons the chrome may render for plugin header
 * actions. Explicit **named** imports (not `import * as Icons`) so
 * esbuild/rslib tree-shake the chrome bundle down to exactly these —
 * a namespace import + dynamic key access retains every Lucide icon
 * (review §2.3). To support a new `action.icon` value, add its named
 * import here; the chrome-path bundle-budget gate measures the cost.
 *
 * Keys are PascalCase Lucide export names; {@link resolveIcon}
 * matches case/separator-insensitively so a plugin may pass
 * `"download"`, `"Download"`, or `"down_load"`.
 */
const ICON_REGISTRY: Record<string, LucideIconComponent> = {
	Camera,
	Code,
	Download,
	History,
	Monitor,
	Smartphone,
	Sparkles,
	Tablet,
	Upload,
};

function normalizeIconName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Pre-normalized index so lookup is O(1) and case/separator-blind. */
const NORMALIZED_ICON_REGISTRY: Record<string, LucideIconComponent> =
	Object.fromEntries(
		Object.entries(ICON_REGISTRY).map(([key, icon]) => [
			normalizeIconName(key),
			icon,
		]),
	);

function resolveIcon(name: string | undefined): LucideIconComponent | null {
	const trimmed = name?.trim();
	if (trimmed === undefined || trimmed.length === 0) return null;
	return NORMALIZED_ICON_REGISTRY[normalizeIconName(trimmed)] ?? null;
}

export interface HeaderActionButtonProps {
	readonly action: StudioHeaderAction;
	readonly ctx: StudioPluginContext;
	readonly variant?: "button" | "menuitem";
}

/**
 * Evaluate a plugin's `disabled` predicate without letting a throw
 * crash chrome render (PRD §9.2 — same blast-radius guarantee as the
 * `onClick` catch below). A throwing predicate fails safe: the action
 * is treated as disabled so a buggy plugin can't surface a broken
 * control.
 */
function evaluateDisabled(
	action: StudioHeaderAction,
	ctx: StudioPluginContext,
): boolean {
	if (action.disabled === undefined) return false;
	try {
		return action.disabled(ctx) === true;
	} catch (error) {
		ctx.log(
			"error",
			`header action "${action.id}" disabled() threw`,
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: { value: String(error) },
		);
		return true;
	}
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
	const disabled = evaluateDisabled(action, ctx) || pending;

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
