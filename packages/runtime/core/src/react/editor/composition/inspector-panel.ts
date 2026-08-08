/**
 * @file The inspector-panel contract, in its own module.
 *
 * `StudioInspectorPanel` lived in `StudioPuckLayout.tsx` while the
 * roster was empty. Once `p4-009` gave the layout a **default** roster,
 * the layout began importing the panels and each panel already imported
 * this type back from the layout — a dependency cycle
 * (`pnpm madge` is a CI gate, and it flags the pair regardless of the
 * import being type-only).
 *
 * Both sides now depend on this leaf instead, which is the honest shape
 * anyway: the contract is not owned by the layout, it is the agreement
 * *between* the layout and the panels.
 */

import type { ReactNode } from "react";

/**
 * One pluggable inspector tab. `labelKey` is a `studio.*` catalog key
 * (inline strings are prohibited — the catalog owns all four locales).
 */
export interface StudioInspectorPanel {
	readonly id: string;
	readonly labelKey: string;
	readonly render: () => ReactNode;
}
