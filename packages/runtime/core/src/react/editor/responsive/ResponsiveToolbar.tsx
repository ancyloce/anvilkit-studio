"use client";

/**
 * @file `ResponsiveToolbar` — write-target selector, follow-mode and
 * overrides-only toggles, and breakpoint CRUD (PLAN-0020
 * CORE-P1A-008; ED-RESP-001..003; §12.1–§12.3).
 *
 * The write target is always visible next to the viewport controls
 * (AC: "write target always visible"); switching it never enters
 * history. Breakpoint edits commit through `breakpoints.set` — one
 * intent per change — with the §12.2 deletion preview offering
 * merge-to-base or discard when overridden nodes would be affected.
 */

import type {
	BreakpointDefinition,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
	EditorCommandPort,
} from "../../../editor/legacy/index.js";
import { ChevronDown, Eye, Link2, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { Input } from "@/primitives/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/primitives/popover";
import { Switch } from "@/primitives/switch";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useOptionalStudioEditorInternals } from "./toolbar-internals.js";

/** Count nodes carrying overrides at one breakpoint (§12.2 preview). */
export function countOverriddenNodes(
	authoring: AuthoringStateV1,
	breakpointId: string,
): number {
	let count = 0;
	for (const record of Object.values(authoring.nodes)) {
		const hasOverride = (
			["layout", "style", "typography", "hidden", "styleRefs"] as const
		).some((family) => {
			const value = record[family] as
				| { overrides?: Readonly<Record<string, unknown>> }
				| undefined;
			const entry = value?.overrides?.[breakpointId];
			return entry !== undefined && entry !== null;
		});
		if (hasOverride) {
			count += 1;
		}
	}
	return count;
}

let breakpointSeq = 0;

function nextBreakpointDefaults(
	existing: readonly BreakpointDefinition[],
): BreakpointDefinition {
	const narrowest = [...existing].sort((a, b) => a.maxWidth - b.maxWidth)[0];
	const width = Math.max(240, (narrowest?.maxWidth ?? 1024) - 160);
	breakpointSeq += 1;
	return {
		id: `bp-${crypto.randomUUID().slice(0, 8)}`,
		label: `Breakpoint ${breakpointSeq}`,
		maxWidth: width,
		order: existing.length,
		enabled: true,
	};
}

function DeleteRow({
	breakpoint,
	overriddenCount,
	onDelete,
}: {
	readonly breakpoint: BreakpointDefinition;
	readonly overriddenCount: number;
	readonly onDelete: (mode: "merge-to-base" | "discard") => void;
}): ReactNode {
	const msg = useMsg();
	const [confirming, setConfirming] = useState(false);
	if (!confirming) {
		return (
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-6"
				aria-label={msg("studio.editor.responsive.delete")}
				onClick={() => {
					if (overriddenCount === 0) {
						onDelete("discard");
					} else {
						setConfirming(true);
					}
				}}
			>
				<Trash2 className="size-3" aria-hidden="true" />
			</Button>
		);
	}
	return (
		<span
			className="flex items-center gap-1"
			data-testid={`ak-bp-delete-preview-${breakpoint.id}`}
		>
			<span className="text-[10px] text-[var(--ak-studio-muted-fg)]">
				{msg("studio.editor.responsive.deleteAffects").replace(
					"{count}",
					String(overriddenCount),
				)}
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-6 px-1.5 text-[10px]"
				onClick={() => onDelete("merge-to-base")}
			>
				{msg("studio.editor.responsive.mergeToBase")}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-6 px-1.5 text-[10px]"
				onClick={() => onDelete("discard")}
			>
				{msg("studio.editor.responsive.discard")}
			</Button>
		</span>
	);
}

function BreakpointEditor({
	commands,
	authoring,
	breakpoints,
	revision,
}: {
	readonly commands: EditorCommandPort;
	readonly authoring: AuthoringStateV1;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly revision: number;
}): ReactNode {
	const msg = useMsg();

	const commitSet = (
		next: readonly BreakpointDefinition[],
		removedOverrides?: Readonly<Record<string, "merge-to-base" | "discard">>,
	): void => {
		void commands.execute({
			id: crypto.randomUUID(),
			expectedRevision: revision,
			source: "inspector",
			timestamp: Date.now(),
			type: "breakpoints.set",
			breakpoints: next,
			...(removedOverrides !== undefined ? { removedOverrides } : {}),
		});
	};

	return (
		<div className="flex w-72 flex-col gap-2" data-testid="ak-bp-editor">
			<span className="text-xs font-medium text-[var(--ak-studio-fg)]">
				{msg("studio.editor.responsive.editBreakpoints")}
			</span>
			{breakpoints.map((breakpoint) => (
				<div key={breakpoint.id} className="flex items-center gap-1.5">
					<Input
						type="text"
						value={breakpoint.label}
						aria-label={msg("studio.editor.responsive.label")}
						className="h-7 flex-1 text-xs"
						onChange={(event) =>
							commitSet(
								breakpoints.map((entry) =>
									entry.id === breakpoint.id
										? { ...entry, label: event.target.value }
										: entry,
								),
							)
						}
					/>
					<Input
						type="text"
						inputMode="numeric"
						value={String(breakpoint.maxWidth)}
						aria-label={msg("studio.editor.responsive.maxWidth")}
						className="h-7 w-16 text-xs tabular-nums"
						onChange={(event) => {
							const width = Number(event.target.value);
							if (Number.isInteger(width) && width >= 240 && width <= 7680) {
								commitSet(
									breakpoints.map((entry) =>
										entry.id === breakpoint.id
											? { ...entry, maxWidth: width }
											: entry,
									),
								);
							}
						}}
					/>
					<Switch
						checked={breakpoint.enabled}
						aria-label={msg("studio.editor.responsive.enabled")}
						onCheckedChange={(enabled) =>
							commitSet(
								breakpoints.map((entry) =>
									entry.id === breakpoint.id ? { ...entry, enabled } : entry,
								),
							)
						}
					/>
					<DeleteRow
						breakpoint={breakpoint}
						overriddenCount={countOverriddenNodes(authoring, breakpoint.id)}
						onDelete={(mode) =>
							commitSet(
								breakpoints.filter((entry) => entry.id !== breakpoint.id),
								{ [breakpoint.id]: mode },
							)
						}
					/>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-7 text-xs"
				disabled={breakpoints.length >= 8}
				onClick={() =>
					commitSet([...breakpoints, nextBreakpointDefaults(breakpoints)])
				}
				data-testid="ak-bp-add"
			>
				<Plus className="size-3" aria-hidden="true" />
				{msg("studio.editor.responsive.addBreakpoint")}
			</Button>
		</div>
	);
}

/** The floating responsive toolbar cluster. */
export default function ResponsiveToolbar(): ReactNode {
	const msg = useMsg();
	const internals = useOptionalStudioEditorInternals();
	const snapshot = internals?.port?.getSnapshot();
	const viewportState = internals?.viewport?.getState();

	const active = viewportState?.activeBreakpoint ?? "base";
	const breakpoints = snapshot?.breakpoints ?? [];
	const activeLabel = useMemo(() => {
		if (active === "base") {
			return msg("studio.editor.responsive.base");
		}
		return (
			breakpoints.find((breakpoint) => breakpoint.id === active)?.label ??
			active
		);
	}, [active, breakpoints, msg]);

	if (
		internals?.port == null ||
		internals.viewport == null ||
		snapshot == null
	) {
		return null;
	}
	const viewport = internals.viewport;

	return (
		<div
			className="flex items-center gap-1"
			data-testid="ak-responsive-toolbar"
		>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="h-8 gap-1.5 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] px-2 text-[var(--ak-studio-fg)] shadow-[var(--shadow-floating)]"
							data-testid="ak-write-target"
						>
							<span className="text-[10px] uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
								{msg("studio.editor.responsive.writeTarget")}
							</span>
							<span className="text-xs font-medium">{activeLabel}</span>
							<ChevronDown
								className="size-3 text-[var(--ak-studio-muted-fg)]"
								aria-hidden="true"
							/>
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					<DropdownMenuItem
						onClick={() => viewport.setWriteTarget("base")}
						className={cn(
							"gap-2 text-xs",
							active === "base" && "font-semibold",
						)}
					>
						{msg("studio.editor.responsive.base")}
					</DropdownMenuItem>
					{breakpoints.map((breakpoint) => (
						<DropdownMenuItem
							key={breakpoint.id}
							onClick={() => viewport.setWriteTarget(breakpoint.id)}
							className={cn(
								"gap-2 text-xs",
								active === breakpoint.id && "font-semibold",
								!breakpoint.enabled && "opacity-50",
							)}
						>
							<span className="grow">{breakpoint.label}</span>
							<span className="tabular-nums text-muted-foreground">
								≤{breakpoint.maxWidth}px
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				variant={viewportState?.followViewport ? "secondary" : "ghost"}
				size="icon"
				className="size-8 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] shadow-[var(--shadow-floating)]"
				aria-label={msg("studio.editor.responsive.follow")}
				aria-pressed={viewportState?.followViewport ?? false}
				title={msg("studio.editor.responsive.follow")}
				onClick={() =>
					viewport.setFollowViewport(!(viewportState?.followViewport ?? true))
				}
				data-testid="ak-follow-viewport"
			>
				<Link2 className="size-3.5" aria-hidden="true" />
			</Button>

			<Button
				variant={viewportState?.showOnlyOverrides ? "secondary" : "ghost"}
				size="icon"
				className="size-8 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] shadow-[var(--shadow-floating)]"
				aria-label={msg("studio.editor.responsive.showOnlyOverrides")}
				aria-pressed={viewportState?.showOnlyOverrides ?? false}
				title={msg("studio.editor.responsive.showOnlyOverrides")}
				onClick={() =>
					viewport.setShowOnlyOverrides(
						!(viewportState?.showOnlyOverrides ?? false),
					)
				}
				data-testid="ak-show-overrides"
			>
				<Eye className="size-3.5" aria-hidden="true" />
			</Button>

			<Popover>
				<PopoverTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="h-8 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] px-2 text-xs shadow-[var(--shadow-floating)]"
							data-testid="ak-bp-editor-trigger"
						>
							{msg("studio.editor.responsive.breakpoints")}
						</Button>
					}
				/>
				<PopoverContent align="start" className="w-auto p-3">
					<BreakpointEditor
						commands={internals.port}
						authoring={snapshot.authoring}
						breakpoints={breakpoints}
						revision={snapshot.revision}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
