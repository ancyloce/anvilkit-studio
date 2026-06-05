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
import { errorToLogMeta } from "@/components/studio-log";
import { Button } from "@/primitives/button";
import { DropdownMenuItem } from "@/primitives/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-context";
import type {
	StaticHeaderActionPlaceholder,
	StudioHeaderAction,
	StudioPluginContext,
} from "@/types/plugin";

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
			errorToLogMeta(error),
		);
		return true;
	}
}

/**
 * Resolve the visible label for a header action (live or placeholder):
 * `labelKey` (an i18n key) wins, resolved via `useMsg(labelKey, label)` so
 * a missing key falls back to the deprecated raw `label`; otherwise the raw
 * `label`, or `""` for an icon-only action that supplies neither (live
 * actions with neither are already rejected by `composeHeaderActions`).
 */
function resolveActionLabel(
	action: Pick<StudioHeaderAction, "labelKey" | "label">,
	msg: (key: string, fallback?: string) => string,
): string {
	if (action.labelKey !== undefined) {
		return msg(action.labelKey, action.label);
	}
	return action.label ?? "";
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
	const msg = useMsg();
	const disabled = evaluateDisabled(action, ctx) || pending;

	const handleClick = useCallback(async (): Promise<void> => {
		setPending(true);
		try {
			await action.onClick(ctx);
		} catch (error) {
			ctx.log(
				"error",
				`header action "${action.id}" threw`,
				errorToLogMeta(error),
			);
		} finally {
			setPending(false);
		}
	}, [action, ctx]);

	const Icon = resolveIcon(action.icon);
	const iconNode = Icon === null ? null : <Icon />;
	// `labelKey` (i18n) wins, with the deprecated raw `label` as the
	// missing-key fallback; an action with neither is rejected upstream by
	// `composeHeaderActions`, so `text` is the visible affordance.
	const text = resolveActionLabel(action, msg);

	if (variant === "menuitem") {
		return (
			<DropdownMenuItem
				disabled={disabled}
				onClick={() => {
					void handleClick();
				}}
			>
				{iconNode}
				<span>{text}</span>
			</DropdownMenuItem>
		);
	}

	const buttonVariant = action.group === "primary" ? "default" : "ghost";
	const button = (
		<Button
			variant={buttonVariant}
			size={action.icon !== undefined && text.length === 0 ? "icon" : "default"}
			disabled={disabled}
			onClick={() => {
				void handleClick();
			}}
		>
			{iconNode}
			{text.length > 0 ? <span>{text}</span> : null}
		</Button>
	);

	if (action.icon !== undefined && text.length > 0) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={<span className="inline-flex">{button}</span>}
				/>
				<TooltipContent>{text}</TooltipContent>
			</Tooltip>
		);
	}
	return button;
}

export interface HeaderActionPlaceholderButtonProps {
	readonly action: StaticHeaderActionPlaceholder;
}

/**
 * Render a {@link StaticHeaderActionPlaceholder} — the *disabled*,
 * non-interactive stand-in shown while a deferred plugin's chunk loads
 * (3.3). It mirrors {@link HeaderActionButton}'s icon + label + variant
 * resolution so the placeholder occupies the **exact** geometry the live
 * button will, then swaps in place with no layout shift.
 *
 * Needs no {@link StudioPluginContext}: a placeholder carries no
 * `onClick` / `disabled` closures (those only exist post-`register()`),
 * so this renders pure presentation.
 */
export function HeaderActionPlaceholderButton({
	action,
}: HeaderActionPlaceholderButtonProps): ReactNode {
	const msg = useMsg();
	const Icon = resolveIcon(action.icon);
	const iconNode = Icon === null ? null : <Icon />;
	const buttonVariant = action.group === "primary" ? "default" : "ghost";
	// A reserved slot resolves `labelKey` against the active locale exactly
	// like the live button, so the pre-chunk-load placeholder shows the
	// localized label (strictly better than a baked raw string).
	const text = resolveActionLabel(action, msg);

	const button = (
		<Button
			variant={buttonVariant}
			size={action.icon !== undefined && text.length === 0 ? "icon" : "default"}
			disabled
			// Placeholder: inert until its plugin's chunk registers a live
			// action of the same id and the chrome swaps this out.
			aria-disabled
			data-header-action-placeholder={action.id}
		>
			{iconNode}
			{text.length > 0 ? <span>{text}</span> : null}
		</Button>
	);

	if (action.icon !== undefined && text.length > 0) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={<span className="inline-flex">{button}</span>}
				/>
				<TooltipContent>{text}</TooltipContent>
			</Tooltip>
		);
	}
	return button;
}
