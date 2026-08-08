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
 */

import type { AuthorableStyleProperty } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
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
import type { AuthoredSummary, SelectionStyleTarget } from "./targets.js";
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
}

/** One target: its hidden flag, its style refs, and its properties. */
export function StyleTargetSection({
	target,
	nodeIds,
	authored,
	definitions,
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
