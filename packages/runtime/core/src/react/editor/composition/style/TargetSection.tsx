"use client";

/**
 * @file `StyleTargetSection` — one declared style target's controls
 * (PLAN-0028 `p4-001`).
 *
 * A section is the unit of *address*: `(nodeIds, targetId, layer)` is
 * fixed here and handed to every control beneath, which is why the read
 * and the write cannot address different things. The three carriers a
 * target owns each get their affordance — `hidden`, `styleRefs` and the
 * granted style properties — because all three are per-target on the
 * write side already (`puck/update-appearance.ts`).
 *
 * **Non-responsive targets always author base.** The shell holds one
 * write layer (`p4-004`), but `StyleTargetCapability.responsive` is
 * per target: a target that does not declare itself responsive must not
 * be authorable at a breakpoint. Rather than disable its controls while
 * the shell points at `md` — which reads as "broken" — the section
 * pins its own layer to `"base"` and says so through `data-layer`. The
 * result is that a breakpoint override for such a target is
 * unrepresentable, not merely discouraged.
 *
 * The four `data-authored-*` attributes are carried over verbatim from
 * the P2-02 read-only panel: the existing E2E suites select on them.
 *
 * ### The multi-instance truth, stated here (`p5-004`, §3.7.4)
 *
 * A repeated target styles every instance it is stamped on, so the
 * count belongs **at the point of edit** — in the section whose controls
 * are about to write it, above them, in the panel. Not a tooltip, not a
 * help page, and not only the canvas live region: the author reading
 * "Card" and reaching for a background needs to know it is six cards
 * before the click, not after it.
 *
 * Per-instance divergence is a **non-goal** (PLAN-0026 §8), so this
 * section offers no control for it — not even a disabled one, which
 * would advertise an affordance that is never arriving. The notice names
 * the Properties tab instead, which is where both routes live: the
 * component's item-level props and PLAN-0027 §2.2's `classNames`
 * passthrough, keyed by these same target ids.
 */

import type { AuthorableStyleProperty } from "@anvilkit/contracts/editor";
import { type ReactNode, useCallback, useSyncExternalStore } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import {
	AUTHORABLE_PROPERTY_LOCATIONS,
	type AuthorablePropertyLocation,
} from "../../../../puck/component-metadata.js";
import { useWriteLayer } from "../write-layer.js";
import {
	type StyleDefinitionChoice,
	StyleRefsControl,
	SwitchControl,
} from "./controls/misc.js";
import { StylePropertyControl } from "./PropertyControl.js";
import {
	type AuthoredSummary,
	countTargetElements,
	type ObservableTargetElementSource,
	type SelectionStyleTarget,
} from "./targets.js";
import { type StyleFieldAddress, useStyleField } from "./use-style-field.js";

type Family = AuthorablePropertyLocation["family"];

/** Display order and heading key of the three authoring families. */
const FAMILIES: readonly { family: Family; labelKey: string }[] = [
	{ family: "layout", labelKey: "studio.editor.inspector.section.layout" },
	{ family: "visual", labelKey: "studio.editor.inspector.section.style" },
	{
		family: "typography",
		labelKey: "studio.editor.inspector.section.typography",
	},
];

/** Props for {@link StyleTargetSection}. */
export interface StyleTargetSectionProps {
	readonly target: SelectionStyleTarget;
	/** The whole selection; every write is one atomic multi-node update. */
	readonly nodeIds: readonly string[];
	/** The primary node's authored summary (the `data-authored-*` set). */
	readonly authored: AuthoredSummary;
	/** Document style definitions available to attach. */
	readonly definitions: readonly StyleDefinitionChoice[];
	/**
	 * The canvas element index, or `null` with no canvas mounted. Only
	 * {@link TargetMatchCount} reads it, and only it subscribes.
	 */
	readonly source: ObservableTargetElementSource | null;
}

/** One target: its hidden flag, its style refs, and its properties. */
export function StyleTargetSection({
	target,
	nodeIds,
	authored,
	definitions,
	source,
}: StyleTargetSectionProps): ReactNode {
	const msg = useMsg();
	const shell = useWriteLayer();
	const layer = target.responsive ? shell.layer : "base";
	const address: StyleFieldAddress = {
		nodeIds,
		targetId: target.id,
		layer,
	};

	const hidden = useStyleField<boolean>(address, { field: "hidden" });
	const styleRefs = useStyleField<readonly string[]>(address, {
		field: "styleRefs",
	});

	const byFamily = new Map<Family, AuthorableStyleProperty[]>();
	for (const property of target.properties) {
		const family = AUTHORABLE_PROPERTY_LOCATIONS[property]?.family;
		if (family === undefined) continue;
		const bucket = byFamily.get(family);
		if (bucket === undefined) byFamily.set(family, [property]);
		else bucket.push(property);
	}

	return (
		<section
			data-testid={`ak-style-target-${target.id}`}
			data-responsive={target.responsive}
			data-layer={layer}
			data-authored-base={authored.baseProperties}
			data-authored-overrides={authored.overrideLayers}
			data-authored-style-refs={authored.styleRefs}
			data-authored-hidden={authored.hidden}
			className="flex flex-col gap-2 border-b border-[var(--ak-studio-border)] pb-3 last:border-b-0"
		>
			<h3 className="text-[12px] font-medium">{target.label}</h3>

			<TargetMatchCount
				source={source}
				nodeIds={nodeIds}
				targetId={target.id}
			/>

			<SwitchControl
				label={msg("studio.editor.layers.hide")}
				field={hidden}
				testId={`ak-style-hidden-${target.id}`}
			/>
			<StyleRefsControl
				label={msg("studio.editor.style.definitions")}
				field={styleRefs}
				definitions={definitions}
				testId={`ak-style-refs-${target.id}`}
			/>

			{FAMILIES.map(({ family, labelKey }) => {
				const properties = byFamily.get(family);
				if (properties === undefined) return null;
				return (
					<div
						key={family}
						className="flex flex-col gap-2"
						data-testid={`ak-style-group-${target.id}-${family}`}
					>
						<h4 className="text-[11px] font-medium text-[var(--ak-studio-muted-fg)]">
							{msg(labelKey)}
						</h4>
						{properties.map((property) => (
							<StylePropertyControl
								key={property}
								address={address}
								property={property}
							/>
						))}
					</div>
				);
			})}
		</section>
	);
}

/* ------------------------------------------------------------------ *
 * The multi-instance count (§3.7.4)
 * ------------------------------------------------------------------ */

function noopUnsubscribe(): void {
	// Intentionally empty: with no canvas there is nothing to unsubscribe.
}

/**
 * "This change affects N elements", stated above the controls that
 * make the change. The English is a plain plural, not the catalog's
 * usual `element(s)` hedge, because the guard below makes N < 2
 * unrenderable — a hedge for a count that cannot occur is noise.
 *
 * **Live by construction.** A count computed once at selection is worse
 * than no count — adding a fourth post has to move "3" to "4" — so this
 * reads through `useSyncExternalStore` against the registry's own
 * `observe`, which fires from the single MutationObserver that already
 * marks the index dirty. Two consequences worth stating: the number can
 * never lag the render it describes, and the subscription is scoped to
 * *this* element. The ~20 `useStyleField` bindings beneath it are
 * siblings, not children, so a canvas mutation repaints one `<p>` and
 * touches no control — the same containment `p5-003` gave the target
 * picker, on the same seam.
 *
 * **Renders nothing below 2.** One element is the unremarkable case and
 * an affordance that appears there carries no information; zero means
 * the target is not in this render, which the picker already says
 * (`data-presence="absent"`) and which this must not restate as
 * "affects 0 elements".
 *
 * **No per-instance escape hatch, and no disabled stub of one.** The
 * compiler emits one exact-pair selector per `(node, target)`; a
 * "this one only" control would need either a selector it cannot emit
 * or a second style path, and both are Puck-contract violations. What
 * the notice does instead is name where per-instance variation actually
 * lives — the Properties tab, holding the component's item-level props
 * and PLAN-0027 §2.2's `classNames` map, which is keyed by these same
 * target ids. It is a pointer, deliberately not a control: a disabled
 * button here would promise per-instance styling is coming.
 */
function TargetMatchCount({
	source,
	nodeIds,
	targetId,
}: {
	readonly source: ObservableTargetElementSource | null;
	readonly nodeIds: readonly string[];
	readonly targetId: string;
}): ReactNode {
	const msg = useMsg();
	const subscribe = useCallback(
		(onChange: () => void) => source?.observe(onChange) ?? noopUnsubscribe,
		[source],
	);
	const getCount = useCallback(
		() => countTargetElements(source, nodeIds, targetId),
		[source, nodeIds, targetId],
	);
	const count = useSyncExternalStore(subscribe, getCount, getCount);

	if (count < 2) return null;
	return (
		<p
			className="flex flex-col gap-0.5 rounded-sm bg-[var(--ak-studio-muted)] px-2 py-1 text-[10px] text-[var(--ak-studio-muted-fg)]"
			data-testid={`ak-style-multi-instance-${targetId}`}
			data-count={count}
		>
			<span>
				{msg("studio.editor.target.multiInstance").replace(
					"{count}",
					String(count),
				)}
			</span>
			{/* Where per-instance variation lives. `p5-008` landed
			    `studio.editor.target.perInstance`, so this is now the full
			    sentence `p5-004` wanted rather than the bare `→ Properties`
			    it settled for: a lone arrow plus a tab name announces as
			    "Properties" to a screen reader, which is not guidance. The
			    tab's own name stays interpolated so it has exactly one
			    translation, and this is still prose, not a control —
			    PLAN-0026 §8 forbids the affordance, not the wayfinding. */}
			<span data-testid={`ak-style-per-instance-route-${targetId}`}>
				{msg("studio.editor.target.perInstance").replace(
					"{tab}",
					msg("studio.editor.inspector.tab.properties"),
				)}
			</span>
		</p>
	);
}
