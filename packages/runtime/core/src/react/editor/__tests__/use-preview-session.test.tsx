/**
 * @file `usePreviewSession` lifecycle (CORE-P3-002; ED-MOTION-002/003).
 *
 * ### The regression these tests exist for
 *
 * `?editor=1` crashed with "Maximum update depth exceeded" at
 * `usePreviewSession`. The hook used two effects: one replaced a stale
 * session and returned `() => next.dispose()`, the other disposed the
 * current session on change. That cleanup disposed the session it had
 * just installed, so:
 *
 *   create next → setSession(next) → deps change → cleanup disposes
 *   next → effect re-runs → `!session.disposed` fails → create another
 *
 * …forever. Under React StrictMode (Next dev) it needed no mode change
 * to start: the simulated unmount disposed the initial session and the
 * remount found it disposed.
 *
 * The mount tests below run under `<StrictMode>` deliberately — that is
 * the configuration the bug appeared in, and a non-strict render would
 * not have caught it.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PreviewSession } from "../../../editor/index.js";
import { usePreviewSession } from "../interactions/use-preview-mode.js";

afterEach(cleanup);

/** Renders the hook and reports render count + the live session. */
function Probe({
	mode,
	seen,
}: {
	readonly mode: "design" | "preview";
	readonly seen: { renders: number; sessions: PreviewSession[] };
}) {
	const session = usePreviewSession(mode);
	seen.renders += 1;
	const last = useRef<PreviewSession | null>(null);
	if (last.current !== session) {
		last.current = session;
		seen.sessions.push(session);
	}
	return (
		<span data-testid="probe" data-disposed={String(session.disposed)}>
			{session.mode}
		</span>
	);
}

function tracker() {
	return { renders: 0, sessions: [] as PreviewSession[] };
}

describe("usePreviewSession (CORE-P3-002)", () => {
	it("settles on mount under StrictMode instead of looping", () => {
		const seen = tracker();
		render(
			<StrictMode>
				<Probe mode="design" seen={seen} />
			</StrictMode>,
		);

		// The loop produced unbounded renders and setState-in-effect
		// warnings; a settled hook renders a handful of times at most.
		// StrictMode double-invocation plus at most one replacement is
		// well under this bound, while the old code blew past it.
		expect(seen.renders).toBeLessThan(12);
		expect(screen.getByTestId("probe").textContent).toBe("design");
	});

	it("hands back a LIVE session after a StrictMode remount", () => {
		// The remount disposes the initial session. The hook must replace
		// it — and must not then dispose the replacement, which is what
		// started the loop.
		const seen = tracker();
		render(
			<StrictMode>
				<Probe mode="design" seen={seen} />
			</StrictMode>,
		);
		expect(screen.getByTestId("probe").getAttribute("data-disposed")).toBe(
			"false",
		);
	});

	it("replaces and disposes the old session when the mode changes", () => {
		const seen = tracker();
		const { rerender } = render(<Probe mode="design" seen={seen} />);
		const first = seen.sessions[0] as PreviewSession;
		expect(first.mode).toBe("design");
		expect(first.disposed).toBe(false);

		rerender(<Probe mode="preview" seen={seen} />);

		const current = seen.sessions.at(-1) as PreviewSession;
		expect(current.mode).toBe("preview");
		expect(current.disposed).toBe(false);
		// The superseded session released its timers/observers/overrides.
		expect(first.disposed).toBe(true);
		expect(screen.getByTestId("probe").textContent).toBe("preview");
	});

	it("does not churn while the mode is unchanged", () => {
		const seen = tracker();
		const { rerender } = render(<Probe mode="design" seen={seen} />);
		const before = seen.sessions.length;
		rerender(<Probe mode="design" seen={seen} />);
		rerender(<Probe mode="design" seen={seen} />);
		// A re-render with the same mode must reuse the session; a new one
		// would silently drop everything registered against the old.
		expect(seen.sessions.length).toBe(before);
		expect((seen.sessions.at(-1) as PreviewSession).disposed).toBe(false);
	});

	it("disposes the live session on unmount", () => {
		const seen = tracker();
		const { unmount } = render(<Probe mode="preview" seen={seen} />);
		const session = seen.sessions.at(-1) as PreviewSession;
		expect(session.disposed).toBe(false);
		unmount();
		expect(session.disposed).toBe(true);
	});

	it("releases registered disposers exactly once through the session", () => {
		const seen = tracker();
		const { unmount } = render(<Probe mode="preview" seen={seen} />);
		const session = seen.sessions.at(-1) as PreviewSession;
		let released = 0;
		session.register(() => {
			released += 1;
		});
		unmount();
		expect(released).toBe(1);
	});
});
