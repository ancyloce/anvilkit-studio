/**
 * @file Regression test for review 0036 H-5 — a chrome crash must not
 * discard the in-progress document.
 *
 * `<StudioErrorBoundary>` wraps the provider stack that contains
 * `<Puck>`, and Puck holds the live document in an internal store seeded
 * once from its `data` prop (a `useState` initializer — the prop is an
 * initial seed, not a controlled value). So when the boundary catches a
 * chrome render error, `<Puck>` unmounts and that store is destroyed;
 * Retry remounts it from whatever `data` says.
 *
 * Mounting from the raw `data` prop therefore restored the document as
 * it was at first mount and silently threw away the whole session's
 * edits. The shell now mounts from `dataRef` — seeded from the prop,
 * advanced by every `onChange` — so Retry resumes on the work in
 * progress.
 *
 * The Puck mock mirrors the one semantic that matters here: `data` is
 * read exactly once, at mount.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Studio } from "@/components/Studio";
import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioPluginOverlay,
} from "@/types/plugin";

const puck = vi.hoisted(() => ({
	/** The `data` each `<Puck>` mount was seeded with, in mount order. */
	mounts: [] as unknown[],
	/** The live mount's `onChange`, so a test can report an edit. */
	onChange: null as ((next: unknown) => void) | null,
}));

vi.mock("@puckeditor/core", async () => {
	const { createElement, useState } = await import("react");
	return {
		Puck: (props: {
			readonly data: unknown;
			readonly onChange?: (next: unknown) => void;
		}) => {
			// The load-bearing detail: real Puck reads `data` ONCE, in a
			// `useState` initializer. Later prop values are ignored, which is
			// why a remount is the only moment the seed is observed.
			useState(() => {
				puck.mounts.push(props.data);
				return props.data;
			});
			puck.onChange = props.onChange ?? null;
			return createElement("div", { "data-testid": "puck-mock" });
		},
		useGetPuck: () => () => ({
			appState: { data: null },
			dispatch: () => undefined,
		}),
		createUsePuck: () => () => undefined,
	};
});

const INITIAL_DOC = { root: { props: {} }, content: [], zones: {} };
const EDITED_DOC = {
	root: { props: {} },
	content: [{ type: "Hero", props: { id: "hero-1" } }],
	zones: {},
};

/** Flipped to make the chrome overlay throw on its next render. */
let overlayShouldThrow = false;

function CrashingOverlay(): ReactNode {
	if (overlayShouldThrow) {
		throw new Error("chrome overlay crashed");
	}
	return <span data-testid="overlay-ok" />;
}

function makeCrashPlugin(): StudioPlugin {
	const meta: StudioPluginMeta = {
		id: "com.test.crash",
		name: "crash",
		version: "1.0.0",
		coreVersion: "^0.1.0",
	};
	const overlay: StudioPluginOverlay = {
		id: "crash",
		placement: "canvas",
		component: CrashingOverlay,
	};
	return {
		meta,
		register() {
			return { meta, overlays: [overlay] };
		},
	};
}

beforeEach(() => {
	puck.mounts.length = 0;
	puck.onChange = null;
	overlayShouldThrow = false;
});

afterEach(cleanup);

describe("<Studio> — crash recovery preserves the document (0036 H-5)", () => {
	it("remounts Puck on the live document after a chrome crash and Retry", async () => {
		// React logs a caught render error; the shell also logs through its
		// own sink. Neither is what this test is about.
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const logger = vi.fn();

		try {
			const view = render(
				<Studio
					puckConfig={{ components: {} }}
					plugins={[makeCrashPlugin()]}
					data={INITIAL_DOC}
					logger={logger}
					isSavingDraft={false}
				/>,
			);

			await view.findByTestId("puck-mock");
			expect(puck.mounts).toHaveLength(1);
			expect(puck.mounts[0]).toEqual(INITIAL_DOC);

			// The author edits: Puck reports the new document upstream.
			await act(async () => {
				puck.onChange?.(EDITED_DOC);
			});

			// A chrome overlay throws on the next render pass. `data` keeps
			// the SAME reference across the re-render, so the controller's
			// prop→ref sync stays quiet and the ref holds the edit.
			overlayShouldThrow = true;
			view.rerender(
				<Studio
					puckConfig={{ components: {} }}
					plugins={[makeCrashPlugin()]}
					data={INITIAL_DOC}
					logger={logger}
					isSavingDraft={true}
				/>,
			);

			const errorScreen = await view.findByTestId("studio-error");
			const retry = errorScreen.querySelector("button");
			expect(retry).not.toBeNull();

			// Retry: the boundary resets and the subtree mounts fresh.
			overlayShouldThrow = false;
			await act(async () => {
				fireEvent.click(retry as HTMLButtonElement);
			});

			await view.findByTestId("puck-mock");

			// React re-renders the boundary's subtree more than once while
			// recovering, so the mount COUNT is an implementation detail of
			// React's error path. The invariant is what each mount was
			// seeded with: the first from the prop, and every mount after
			// the edit from the live document. Before the fix all of them
			// were INITIAL_DOC — the session's work, silently discarded.
			expect(puck.mounts.length).toBeGreaterThan(1);
			expect(puck.mounts.at(-1)).toEqual(EDITED_DOC);
			for (const seed of puck.mounts.slice(1)) {
				expect(seed).toEqual(EDITED_DOC);
			}
		} finally {
			consoleError.mockRestore();
		}
	});

	it("seeds the first mount from the data prop", async () => {
		const view = render(
			<Studio
				puckConfig={{ components: {} }}
				data={INITIAL_DOC}
				isSavingDraft={false}
			/>,
		);
		await view.findByTestId("puck-mock");
		expect(puck.mounts).toEqual([INITIAL_DOC]);
	});

	it("seeds an empty document when the host passes no data", async () => {
		const view = render(<Studio puckConfig={{ components: {} }} />);
		await view.findByTestId("puck-mock");
		expect(puck.mounts).toHaveLength(1);
		expect(puck.mounts[0]).toEqual({
			root: { props: {} },
			content: [],
			zones: {},
		});
	});
});
