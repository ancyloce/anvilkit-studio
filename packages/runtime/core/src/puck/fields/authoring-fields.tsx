/**
 * @file Shared hidden custom-field factories (PLAN-0025 §5.3, P2-04).
 *
 * Components declare `appearance`, `interactions`, and `bindings` with
 * THESE constants so the authoring props are explicit, type-checked
 * Puck Config contracts — never accidental data Puck happens to
 * preserve. `visible: false` keeps them out of the Properties tab;
 * StylePanel and friends write them through PuckApi `setData`.
 *
 * Known erratum vs the plan sketch (locked by P0-02): Puck 0.22.4's
 * `CustomFieldRender` must return a `ReactElement`, so the hidden
 * fields render an empty element, not `null`.
 */

import type {
	AnvilAppearance,
	Binding,
	Interaction,
} from "@anvilkit/contracts/editor";
import type { CustomField } from "@puckeditor/core";
import { createElement } from "react";

/** The declared `appearance` field (§5.1 node authoring props). */
export const appearanceField: CustomField<AnvilAppearance | undefined> = {
	type: "custom",
	visible: false,
	render: () => createElement("span", { hidden: true }),
};

/** The declared `interactions` field (owned by the trigger node). */
export const interactionsField: CustomField<
	readonly Interaction[] | undefined
> = {
	type: "custom",
	visible: false,
	render: () => createElement("span", { hidden: true }),
};

/** The declared `bindings` field (owned by the bound node). */
export const bindingsField: CustomField<readonly Binding[] | undefined> = {
	type: "custom",
	visible: false,
	render: () => createElement("span", { hidden: true }),
};
