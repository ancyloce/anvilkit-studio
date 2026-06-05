/**
 * @file `<HeaderActions>` — renders plugin-contributed header actions.
 *
 * Consumes the raw concatenated list (via `runtime.headerActions`
 * or the optional `actions` prop), runs it through
 * `composeHeaderActions()` for `(group, order, id)` ordering, and
 * splits into `primary` / `secondary` / overflow groups.
 *
 * Errors thrown from any `onClick` are caught inside
 * `<HeaderActionButton>` and routed through `ctx.log` — they never
 * unmount the chrome (PRD §9.2).
 */

import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useStudioPluginContextOrNull } from "@/context/plugin-context";
import { useStudioRuntime } from "@/components/use-studio";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { composeHeaderActions } from "@/runtime/header-actions";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioHeaderAction, StudioPluginContext } from "@/types/plugin";
import { HeaderActionButton } from "./HeaderActionButton";

export interface HeaderActionsProps {
	/**
	 * Optional override of the raw action list. Defaults to the
	 * runtime's `headerActions`. Tests pass a fixture here so they
	 * can render `<HeaderActions>` without mounting a full Studio.
	 */
	readonly actions?: readonly StudioHeaderAction[];
	/**
	 * Live plugin context, threaded into each action's `onClick` /
	 * `disabled` callbacks. Defaults to the
	 * `<StudioPluginContextProvider>` value when omitted.
	 */
	readonly ctx?: StudioPluginContext;
}

interface GroupedActions {
	readonly primary: readonly StudioHeaderAction[];
	readonly secondary: readonly StudioHeaderAction[];
	readonly overflow: readonly StudioHeaderAction[];
}

function groupByGroup(composed: readonly StudioHeaderAction[]): GroupedActions {
	const primary: StudioHeaderAction[] = [];
	const secondary: StudioHeaderAction[] = [];
	const overflow: StudioHeaderAction[] = [];
	for (const action of composed) {
		const group = action.group ?? "secondary";
		if (group === "primary") primary.push(action);
		else if (group === "overflow") overflow.push(action);
		else secondary.push(action);
	}
	return { primary, secondary, overflow };
}

export function HeaderActions({
	actions: explicitActions,
	ctx: explicitCtx,
}: HeaderActionsProps): ReactNode {
	const contextCtx = useStudioPluginContextOrNull();
	const ctx = explicitCtx ?? contextCtx;

	if (ctx === null) {
		// Render nothing rather than throwing: a consumer that mounts
		// `<HeaderActions>` outside of `<Studio>` is in a test or
		// preview, and a noisy throw would obscure the actual setup
		// problem.
		return null;
	}

	if (explicitActions !== undefined) {
		return <HeaderActionsContent actions={explicitActions} ctx={ctx} />;
	}

	return <HeaderActionsFromRuntime ctx={ctx} />;
}

function HeaderActionsFromRuntime({
	ctx,
}: {
	readonly ctx: StudioPluginContext;
}): ReactNode {
	const runtime = useStudioRuntime();
	return <HeaderActionsContent actions={runtime.headerActions} ctx={ctx} />;
}

function HeaderActionsContent({
	actions,
	ctx,
}: {
	readonly actions: readonly StudioHeaderAction[];
	readonly ctx: StudioPluginContext;
}): ReactNode {
	const groups = useMemo<GroupedActions>(() => {
		// Defensive filter: `<PublishPanel>` is the canonical entry point
		// for every export format registered with the runtime. Plugin
		// authors normally opt out of contributing a header button via
		// `headerAction: false`, but if a host forgets to pass that flag
		// we still hide any `id` starting with `export-` so the toolbar
		// does not double up on the panel's Export submenu.
		const filtered = actions.filter((a) => !a.id.startsWith("export-"));
		return groupByGroup(composeHeaderActions(filtered));
	}, [actions]);

	return (
		<div className="flex items-center gap-2">
			{groups.secondary.map((action) => (
				<HeaderActionButton key={action.id} action={action} ctx={ctx} />
			))}
			{groups.overflow.length > 0 ? (
				<OverflowMenu actions={groups.overflow} ctx={ctx} />
			) : null}
			{groups.primary.map((action) => (
				<HeaderActionButton key={action.id} action={action} ctx={ctx} />
			))}
		</div>
	);
}

interface OverflowMenuProps {
	readonly actions: readonly StudioHeaderAction[];
	readonly ctx: StudioPluginContext;
}

function OverflowMenu({ actions, ctx }: OverflowMenuProps): ReactNode {
	const msg = useMsg();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={msg("studio.headerActions.overflow")}
					/>
				}
			>
				<MoreHorizontal />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={4}>
				{actions.map((action) => (
					<HeaderActionButton
						key={action.id}
						action={action}
						ctx={ctx}
						variant="menuitem"
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
