/**
 * @file `demoPageAdapter` — a fixture host page source for the editor's
 * §18 page navigation (PLAN-0020 CORE-P3-010; DD-0019 §18).
 *
 * §18 makes the adapter the only thing that reveals page navigation, so
 * the demo has to supply one before `PageNavigator` renders at all.
 *
 * Deliberately **in-memory**, matching `demo-data-source.ts`: the §32.4
 * E2E must be hermetic, and a fixture that hit the network would make
 * the spec flaky for reasons unrelated to the editor.
 *
 * `open()` only records the request. Core's contract is that a page
 * switch is host navigation and never enters Puck history — actually
 * routing here would drag Next's router into a spec that is about the
 * adapter contract, not about routing.
 */

import type {
	EditorPageAdapter,
	EditorPageDescriptor,
} from "@anvilkit/core/types";

const PAGES: EditorPageDescriptor[] = [
	{ id: "home", name: "Home" },
	{ id: "about", name: "About" },
];

/** The last page `open()` was asked for — read by the E2E spec. */
export let lastOpenedPageId: string | null = null;

export const demoPageAdapter: EditorPageAdapter = {
	async list(): Promise<readonly EditorPageDescriptor[]> {
		return [...PAGES];
	},

	async open(pageId: string): Promise<void> {
		lastOpenedPageId = pageId;
		// Surfaced on `window` so a Playwright spec can assert the host was
		// called without needing a real route change.
		if (typeof window !== "undefined") {
			(window as unknown as Record<string, unknown>).__akLastOpenedPage =
				pageId;
		}
	},

	async create(input: { name: string }): Promise<string> {
		const id = `page-${PAGES.length + 1}`;
		PAGES.push({ id, name: input.name });
		return id;
	},
};
