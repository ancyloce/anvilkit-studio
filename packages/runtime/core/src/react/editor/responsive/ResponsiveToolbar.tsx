"use client";

/**
 * @file `ResponsiveToolbar` — write-target selector, follow-mode and
 * overrides-only toggles, and breakpoint CRUD (PLAN-0020
 * CORE-P1A-008; ED-RESP-001..003; §12.1–§12.3).
 *
 * The write target is always visible next to the viewport controls
 * (AC: "write target always visible"); switching it never enters
 * history. Breakpoint edits commit through `commitDesignSystemUpdate`
 * (`p3-009`; formerly the `breakpoints.set` command) — one intent per
 * change, one history entry — with the §12.2 deletion preview offering
 * merge-to-base or discard when overridden nodes would be affected.
 *
 * ### What the command carried that the helper does not
 *
 * `breakpoints.set` took a `removedOverrides` map and the reducer
 * rewrote every node's layered carriers accordingly. The design-system
 * helper writes ONE root prop, so the per-node half is performed here,
 * over the same document, inside the same functional update — see
 * {@link applyBreakpointRemoval}. Same two outcomes, same single undo.
 */

import type {
	AnvilAppearance,
	BreakpointDefinition,
	DesignSystem,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
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
import { documentBreakpoints } from "../../../puck/read-appearance.js";
import {
	commitDesignSystemUpdate,
	commitDesignSystemUpdateOver,
	type DesignSystemCommitDeps,
} from "../../../puck/update-design-system.js";
import { useOptionalStudioEditorInternals } from "./toolbar-internals.js";
import { randomId } from "@/shared/node-id";

/**
 * Every node's `appearance` carrier in the live document, by node id.
 *
 * `p3-009`: the sidecar's flat `authoring.nodes` map is gone, so the
 * §12.2 preview walks the document's own carriers — the same values
 * the compiler reads, which is why the count and the rendering can no
 * longer disagree.
 */
function appearanceNodes(data: PuckData): ReadonlyMap<string, AnvilAppearance> {
	const found = new Map<string, AnvilAppearance>();
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const entry of value) visit(entry);
			return;
		}
		if (value === null || typeof value !== "object") return;
		const node = value as { props?: Record<string, unknown> };
		const props = node.props;
		if (props !== undefined) {
			const id = props.id;
			const appearance = props.appearance;
			if (typeof id === "string" && appearance !== undefined) {
				found.set(id, appearance as AnvilAppearance);
			}
			for (const entry of Object.values(props)) visit(entry);
			return;
		}
		for (const entry of Object.values(value as Record<string, unknown>)) {
			visit(entry);
		}
	};
	visit(data.content ?? []);
	visit((data as { zones?: unknown }).zones ?? {});
	return found;
}

/** Count nodes carrying overrides at one breakpoint (§12.2 preview). */
export function countOverriddenNodes(
	data: PuckData,
	breakpointId: string,
): number {
	let count = 0;
	for (const appearance of appearanceNodes(data).values()) {
		const targets = appearance.targets ?? {};
		const hit = Object.values(targets).some((target) =>
			(["style", "hidden", "styleRefs"] as const).some((family) => {
				const value = target?.[family] as
					| { overrides?: Readonly<Record<string, unknown>> }
					| undefined;
				const entry = value?.overrides?.[breakpointId];
				return entry !== undefined && entry !== null;
			}),
		);
		if (hit) count += 1;
	}
	return count;
}

/**
 * Rewrite every node's layered carriers for a breakpoint that is being
 * deleted (§12.2): `"merge-to-base"` promotes the override to the base
 * layer, `"discard"` drops it. Pure; returns the input by reference
 * when nothing carried that layer.
 */
export function applyBreakpointRemoval(
	data: PuckData,
	breakpointId: string,
	mode: "merge-to-base" | "discard",
): PuckData {
	let changed = false;
	const rewriteLayered = (value: unknown): unknown => {
		if (value === null || typeof value !== "object") return value;
		const layered = value as {
			base?: unknown;
			overrides?: Record<string, unknown>;
		};
		const override = layered.overrides?.[breakpointId];
		if (override === undefined) return value;
		changed = true;
		const { [breakpointId]: _dropped, ...rest } = layered.overrides ?? {};
		const next: Record<string, unknown> = { ...layered };
		if (Object.keys(rest).length > 0) next.overrides = rest;
		else delete next.overrides;
		if (mode === "merge-to-base") next.base = override;
		return next;
	};
	const rewriteAppearance = (appearance: unknown): unknown => {
		if (appearance === null || typeof appearance !== "object") return appearance;
		const parsed = appearance as {
			targets?: Record<string, Record<string, unknown>>;
		};
		if (parsed.targets === undefined) return appearance;
		const nextTargets: Record<string, Record<string, unknown>> = {};
		for (const [targetId, target] of Object.entries(parsed.targets)) {
			const nextTarget: Record<string, unknown> = { ...target };
			for (const family of ["style", "hidden", "styleRefs"] as const) {
				if (target[family] !== undefined) {
					nextTarget[family] = rewriteLayered(target[family]);
				}
			}
			nextTargets[targetId] = nextTarget;
		}
		return { ...parsed, targets: nextTargets };
	};
	const visit = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(visit);
		if (value === null || typeof value !== "object") return value;
		const node = value as { props?: Record<string, unknown> };
		if (node.props === undefined) return value;
		const nextProps: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(node.props)) {
			nextProps[key] =
				key === "appearance" ? rewriteAppearance(entry) : visit(entry);
		}
		return { ...node, props: nextProps };
	};
	const nextContent = (data.content ?? []).map(visit);
	return changed
		? ({ ...data, content: nextContent } as PuckData)
		: data;
}

let breakpointSeq = 0;

function nextBreakpointDefaults(
	existing: readonly BreakpointDefinition[],
): BreakpointDefinition {
	const narrowest = [...existing].sort((a, b) => a.maxWidth - b.maxWidth)[0];
	const width = Math.max(240, (narrowest?.maxWidth ?? 1024) - 160);
	breakpointSeq += 1;
	return {
		id: `bp-${randomId().slice(0, 8)}`,
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
	commitDeps,
	data,
	breakpoints,
}: {
	readonly commitDeps: DesignSystemCommitDeps;
	readonly data: PuckData;
	readonly breakpoints: readonly BreakpointDefinition[];
}): ReactNode {
	const msg = useMsg();

	/**
	 * One breakpoint intent → one history entry.
	 *
	 * A deletion additionally rewrites every node's layered carriers
	 * (§12.2 merge-to-base / discard), which the design-system helper
	 * cannot do for us — it writes one root prop. So the node rewrite is
	 * dispatched first as its own `setData`… no: that would be TWO undo
	 * steps for one intent. Instead the node rewrite is folded into the
	 * SAME functional update by committing it through the design-system
	 * helper's `update` closure over a document we have already
	 * rewritten — see `commitSet`.
	 */
	const commitSet = (
		next: readonly BreakpointDefinition[],
		removedOverrides?: Readonly<Record<string, "merge-to-base" | "discard">>,
	): void => {
		const api = commitDeps.getPuckApi();
		if (api === null) return;
		let document = api.appState.data as PuckData;
		for (const [breakpointId, mode] of Object.entries(
			removedOverrides ?? {},
		)) {
			document = applyBreakpointRemoval(document, breakpointId, mode);
		}
		const nextDesignSystem = (
			current: DesignSystem | undefined,
		): DesignSystem => ({
			tokens: current?.tokens ?? {},
			tokenModes: current?.tokenModes ?? {},
			defaultTokenMode: current?.defaultTokenMode ?? "default",
			styleDefinitions: current?.styleDefinitions ?? {},
			breakpoints: next,
		});
		if (document !== (api.appState.data as PuckData)) {
			// Node carriers changed too: write both halves in ONE dispatch by
			// handing the helper a document that already carries the node
			// rewrite. `commitDesignSystemUpdate` reads `api.appState.data`,
			// so the rewrite is applied here and the root prop by the helper,
			// against the same `setData`.
			commitDesignSystemUpdateOver(commitDeps, document, nextDesignSystem);
			return;
		}
		commitDesignSystemUpdate(commitDeps, nextDesignSystem);
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
						overriddenCount={countOverriddenNodes(data, breakpoint.id)}
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
	const api = internals?.api ?? null;
	const data = (api?.appState.data ?? null) as PuckData | null;
	const viewportState = internals?.viewport?.getState();

	const active = viewportState?.activeBreakpoint ?? "base";
	const breakpoints = data === null ? [] : documentBreakpoints(data);
	const activeLabel = useMemo(() => {
		if (active === "base") {
			return msg("studio.editor.responsive.base");
		}
		return (
			breakpoints.find((breakpoint) => breakpoint.id === active)?.label ??
			active
		);
	}, [active, breakpoints, msg]);

	if (internals == null || api === null || data === null) {
		return null;
	}
	const viewport = internals.viewport;
	if (viewport == null) {
		return null;
	}
	const bridge = internals.bridge;
	const commitDeps: DesignSystemCommitDeps = {
		getPuckApi: () => api,
		getWriterGateError: () => bridge.getWriterGateError(),
	};

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
						commitDeps={commitDeps}
						data={data}
						breakpoints={breakpoints}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
