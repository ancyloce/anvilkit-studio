/**
 * @file Built-in `StudioInsertSection` registrations seeded by `<Studio>`.
 *
 * The PRD §5.4 ships four default sections — `recommended`,
 * `navigation`, `top`, `team`. Real component metadata in the demo
 * uses `suggestedCategory` values like `marketing` / `navigation` /
 * `actions` / `forms`, which are surfaced into the predicate's
 * `metadata.category` slot via the Puck Config's `categories` map (see
 * `./component-category-index.ts`).
 *
 * Section order matters because the override body classifies each
 * component into the **first** matching section. `recommended` sits
 * last (`order: 100`) and matches everything as a catch-all so any
 * component that did not match a higher-specificity section still
 * lands somewhere visible.
 *
 * Plugins extend this list via `ctx.registerInsertSection()`; their
 * registrations merge into the same registry. Empty sections are
 * hidden by the override body — `team` has no built-in match today
 * and stays hidden until a plugin or a future component contributes
 * matching metadata.
 *
 * @see {@link ../../../../../../../docs/PRD/StudioSidebar_Modules_Addition_Claude.md | PRD §5.4}
 */

import type { StudioInsertSection } from "@/types/sidebar";

export const DEFAULT_INSERT_SECTIONS: readonly StudioInsertSection[] = [
	{
		id: "navigation",
		titleKey: "studio.module.insert.section.navigation",
		predicate: (_componentName, metadata) =>
			metadata?.category === "navigation",
		order: 10,
	},
	{
		id: "top",
		titleKey: "studio.module.insert.section.top",
		predicate: (_componentName, metadata) => metadata?.category === "marketing",
		order: 20,
	},
	{
		id: "team",
		titleKey: "studio.module.insert.section.team",
		// No built-in metadata category maps to "team" today; the
		// section sits in the registry so plugins/components that
		// classify their items as `team` can populate it without
		// forking the defaults.
		predicate: () => false,
		order: 30,
	},
	{
		id: "recommended",
		titleKey: "studio.module.insert.section.recommended",
		// Catch-all. Every component that did not match a more-specific
		// section above lands here so the library is never empty.
		predicate: () => true,
		order: 100,
	},
];
