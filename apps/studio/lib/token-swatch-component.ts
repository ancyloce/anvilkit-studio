// Demo-only Puck component that dogfoods
// `@anvilkit/plugin-design-system`'s token-bound field factories
// end-to-end: every visual prop binds to a token ref string in the
// field UI and round-trips through `resolveTokenRef` into a
// `var(--ak-ds-*)` at paint time.
//
// Kept in its own client-only module — and out of `puck-demo.ts` —
// because the plugin's main entry pulls
// `@anvilkit/core/dist/index.js` (which re-exports zustand-backed
// React store providers using `createContext`). `puck-demo.ts` is
// imported by `/puck/render` (a React Server Component) where
// `createContext` is forbidden, so the plugin runtime must only ever
// enter the bundle via client-component code paths.

import {
	createTokenColorField,
	createTokenSpacingField,
	DEFAULT_TOKENS,
	resolveTokenRef,
} from "@anvilkit/plugin-design-system";
import type { ComponentConfig } from "@puckeditor/core";
import { createElement } from "react";

export interface TokenSwatchProps {
	label: string;
	background: string;
	foreground: string;
	padding: string;
}

export const tokenSwatchDefaultProps: TokenSwatchProps = {
	label: "Design tokens flow through here",
	background: "semantic.surface",
	foreground: "semantic.fg",
	padding: "space.4",
};

export const tokenSwatchComponentConfig = {
	label: "Token Swatch",
	defaultProps: tokenSwatchDefaultProps,
	fields: {
		label: { type: "text", label: "Label" },
		background: createTokenColorField({ label: "Background" }),
		foreground: createTokenColorField({ label: "Foreground" }),
		padding: createTokenSpacingField({ label: "Padding" }),
	},
	render: ({ background, foreground, padding, label }) => {
		const bg =
			resolveTokenRef(background, DEFAULT_TOKENS).cssVar ?? "transparent";
		const fg = resolveTokenRef(foreground, DEFAULT_TOKENS).cssVar ?? "inherit";
		const pad = resolveTokenRef(padding, DEFAULT_TOKENS).cssVar ?? "0";
		return createElement(
			"div",
			{
				"data-testid": "ak-demo-token-swatch",
				style: {
					background: bg,
					color: fg,
					padding: pad,
					borderRadius: "var(--ak-ds-radius-md)",
					fontFamily: "system-ui, sans-serif",
				},
			},
			label,
		);
	},
} satisfies ComponentConfig<TokenSwatchProps>;
