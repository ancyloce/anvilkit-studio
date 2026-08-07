"use client";

/**
 * @file `StylePanel` — the composition inspector's Style tab
 * (PLAN-0025 §8.1–§8.2, P2-02).
 *
 * This task lands the READ path: the panel subscribes to Puck state
 * through `createUsePuck` selectors only — `selectedItem`, `config`,
 * and a narrow `appState.data` projection — never the command port,
 * never the sidecar, never overrides. Capability gating comes from the
 * shared metadata-v2 reader (`puck/component-metadata.ts`), the same
 * module the compiler enforces, so the panel can only offer what the
 * compiler will accept (§6.1).
 *
 * Honest capability states (§8.5 — the host may not fabricate
 * support):
 * - nothing selected → `studio.fields.empty`;
 * - selection without a v2 declaration (or zero valid targets) →
 *   `studio.editor.inspector.tab.style.empty`;
 * - declared targets → one section per target, carrying the authored
 *   appearance summary as data attributes for the P2-03 reads model
 *   to grow into.
 *
 * Value controls (single/multi selection, breakpoints, mixed state)
 * are P2-03; commits are P2-04.
 */

import type {
	AnvilAppearance,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
import { safeParseAppearance } from "@anvilkit/schema/editor";
import type { ReactNode } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import {
	type ResolvedStyleTarget,
	readEditorMetadataFor,
	resolveStyleTargets,
} from "../../../puck/component-metadata.js";
import { useReactivePuck } from "../../overrides/utils/use-reactive-puck.js";

/** Tolerant read of a node's authored appearance prop. */
function appearanceOf(props: unknown): AnvilAppearance | undefined {
	const value = (props as { appearance?: unknown } | undefined)?.appearance;
	if (value === undefined) return undefined;
	const parsed = safeParseAppearance(value);
	return parsed.success ? parsed.data : undefined;
}

/** Authored-state summary for one target (P2-03 grows this). */
function summarize(target: TargetAppearance | undefined): {
	readonly baseProperties: number;
	readonly overrideLayers: number;
	readonly styleRefs: number;
	readonly hidden: boolean;
} {
	const base = target?.style?.base;
	const baseProperties =
		Object.keys(base?.layout ?? {}).length +
		Object.keys(base?.visual ?? {}).length +
		Object.keys(base?.typography ?? {}).length;
	const overrideLayers = Object.values(target?.style?.overrides ?? {}).filter(
		(layer) => layer !== null,
	).length;
	return {
		baseProperties,
		overrideLayers,
		styleRefs: target?.styleRefs?.base?.length ?? 0,
		hidden: target?.hidden?.base === true,
	};
}

function TargetSection({
	target,
	appearance,
}: {
	readonly target: ResolvedStyleTarget;
	readonly appearance: AnvilAppearance | undefined;
}): ReactNode {
	const authored = summarize(appearance?.targets?.[target.id]);
	return (
		<section
			data-testid={`ak-style-target-${target.id}`}
			data-responsive={target.responsive}
			data-authored-base={authored.baseProperties}
			data-authored-overrides={authored.overrideLayers}
			data-authored-style-refs={authored.styleRefs}
			data-authored-hidden={authored.hidden}
			className="flex flex-col gap-1 border-b border-[var(--ak-studio-border)] pb-2 last:border-b-0"
		>
			<h3 className="text-[12px] font-medium">{target.label}</h3>
		</section>
	);
}

/**
 * The Style tab body. Must render inside `<Puck>`; wire it into
 * `StudioPuckLayout` as a panel with the existing
 * `studio.editor.inspector.tab.style` label key.
 */
export function StylePanel(): ReactNode {
	const msg = useMsg();
	const selectedItem = useReactivePuck((state) => state.selectedItem);
	const config = useReactivePuck((state) => state.config);
	// The §8.2 narrow appState.data projection this task needs: the
	// document breakpoint count (a primitive, so unrelated data changes
	// do not re-render the panel). The P2-03 breakpoint reads model
	// widens this deliberately.
	const breakpointCount = useReactivePuck((state) => {
		const rootProps = state.appState.data.root?.props as
			| { designSystem?: { breakpoints?: readonly unknown[] } }
			| undefined;
		return rootProps?.designSystem?.breakpoints?.length ?? 0;
	});

	if (selectedItem === null) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-style-panel-empty"
			>
				{msg("studio.fields.empty")}
			</p>
		);
	}

	const targets = resolveStyleTargets(config, selectedItem.type);
	const declared =
		readEditorMetadataFor(config, selectedItem.type) !== undefined &&
		targets.length > 0;
	if (!declared) {
		// §8.5: a component that has not declared editable appearance says
		// so — the panel never invents capabilities for it.
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-style-panel-undeclared"
			>
				{msg("studio.editor.inspector.tab.style.empty")}
			</p>
		);
	}

	const appearance = appearanceOf(selectedItem.props);
	return (
		<div
			className="flex flex-col gap-2"
			data-testid="ak-style-panel"
			data-node-id={String(selectedItem.props.id ?? "")}
			data-node-type={selectedItem.type}
			data-breakpoints={breakpointCount}
		>
			{targets.map((target) => (
				<TargetSection
					key={target.id}
					target={target}
					appearance={appearance}
				/>
			))}
		</div>
	);
}
