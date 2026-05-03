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
import { type ReactNode, useMemo, useState } from "react";

import { composeHeaderActions } from "../../../runtime/header-actions.js";
import type {
	StudioHeaderAction,
	StudioPluginContext,
} from "../../../types/plugin.js";
import { useStudioRuntime } from "../../hooks/use-studio.js";
import { useStudioPluginContextOrNull } from "../context/plugin-context.js";
import { Button } from "../primitives/Button.js";
import { HeaderActionButton } from "./HeaderActionButton.js";

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

function groupByGroup(
	composed: readonly StudioHeaderAction[],
): GroupedActions {
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
	const runtime = useStudioRuntimeOrNull();
	const contextCtx = useStudioPluginContextOrNull();
	const ctx = explicitCtx ?? contextCtx;
	const sourceActions =
		explicitActions ?? runtime?.headerActions ?? EMPTY_ACTIONS;

	const groups = useMemo<GroupedActions>(
		() => groupByGroup(composeHeaderActions(sourceActions)),
		[sourceActions],
	);

	if (ctx === null) {
		// Render nothing rather than throwing: a consumer that mounts
		// `<HeaderActions>` outside of `<Studio>` is in a test or
		// preview, and a noisy throw would obscure the actual setup
		// problem.
		return null;
	}

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

const EMPTY_ACTIONS: readonly StudioHeaderAction[] = [];

/**
 * Read the runtime if a `<StudioRuntimeProvider>` is present; return
 * `null` otherwise. The strict context throws when absent, but
 * `<HeaderActions>` should still work in unit-test fixtures that
 * pass `actions` directly.
 */
function useStudioRuntimeOrNull(): { readonly headerActions: readonly StudioHeaderAction[] } | null {
	try {
		return useStudioRuntime();
	} catch {
		return null;
	}
}

interface OverflowMenuProps {
	readonly actions: readonly StudioHeaderAction[];
	readonly ctx: StudioPluginContext;
}

/**
 * Minimal overflow popover. Uses native `<details>` for v1 — Phase 5
 * can swap this for the Base UI Menu if richer keyboard handling is
 * needed. Keeping this dependency-light avoids pulling in the
 * `@base-ui/react/menu` module just for the overflow.
 */
function OverflowMenu({ actions, ctx }: OverflowMenuProps): ReactNode {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<Button
				variant="ghost"
				size="icon"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((p) => !p)}
			>
				<MoreHorizontal />
			</Button>
			{open ? (
				<div
					role="menu"
					className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-1 shadow-md"
				>
					{actions.map((action) => (
						<HeaderActionButton
							key={action.id}
							action={action}
							ctx={ctx}
							variant="menuitem"
						/>
					))}
				</div>
			) : null}
		</div>
	);
}
