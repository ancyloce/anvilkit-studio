import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	PresenceCursor,
	PresenceLayer,
	PresenceSelectionRing,
	type PresenceSource,
	type PresenceStateFrame,
	usePresence,
} from "../index";

afterEach(() => {
	cleanup();
});

describe("<PresenceCursor>", () => {
	it("renders the peer label and applies the peer color", () => {
		render(
			<PresenceCursor
				peer={{ id: "alice", displayName: "Alice", color: "#f43f5e" }}
				cursor={{ x: 12, y: 34 }}
			/>,
		);
		const label = screen.getByText("Alice");
		expect(label).toBeTruthy();
		expect(label.getAttribute("style")).toContain("background-color");
	});

	it("does not render a label when displayName is omitted", () => {
		render(
			<PresenceCursor
				peer={{ id: "anon" }}
				cursor={{ x: 0, y: 0 }}
			/>,
		);
		expect(screen.queryByText(/anon/i)).toBeNull();
	});
});

describe("<PresenceSelectionRing>", () => {
	it("positions the ring by transform and sizes it from rect", () => {
		const { container } = render(
			<PresenceSelectionRing
				peer={{ id: "bob", color: "#0ea5e9" }}
				rect={{ x: 10, y: 20, width: 100, height: 50 }}
			/>,
		);
		const ring = container.querySelector(
			"[data-slot=presence-selection-ring]",
		) as HTMLElement | null;
		expect(ring).toBeTruthy();
		expect(ring?.style.transform).toBe("translate(10px, 20px)");
		expect(ring?.style.width).toBe("100px");
		expect(ring?.style.height).toBe("50px");
	});
});

describe("<PresenceLayer>", () => {
	it("renders one cursor per peer and skips peers without coords", () => {
		const peers: PresenceStateFrame[] = [
			{
				peer: { id: "alice", displayName: "Alice" },
				cursor: { x: 1, y: 2 },
			},
			{
				peer: { id: "bob", displayName: "Bob" },
			},
		];
		const { container } = render(<PresenceLayer peers={peers} />);
		const cursors = container.querySelectorAll("[data-slot=presence-cursor]");
		expect(cursors.length).toBe(1);
		expect(cursors[0]?.getAttribute("data-peer-id")).toBe("alice");
	});

	it("renders selection rings via the resolver", () => {
		const peers: PresenceStateFrame[] = [
			{
				peer: { id: "alice", displayName: "Alice" },
				selection: { nodeIds: ["hero-1", "missing"] },
			},
		];
		const { container } = render(
			<PresenceLayer
				peers={peers}
				resolveSelectionRect={(id) =>
					id === "hero-1" ? { x: 0, y: 0, width: 10, height: 10 } : null
				}
			/>,
		);
		const rings = container.querySelectorAll(
			"[data-slot=presence-selection-ring]",
		);
		expect(rings.length).toBe(1);
	});
});

describe("usePresence", () => {
	it("subscribes, drops self frames, and exposes updateSelf", () => {
		let listener: ((peers: readonly PresenceStateFrame[]) => void) | undefined;
		const update = vi.fn();
		const source: PresenceSource = {
			update,
			onPeerChange(cb) {
				listener = cb;
				return () => {
					listener = undefined;
				};
			},
		};
		const { result } = renderHook(() =>
			usePresence(source, { self: { id: "alice" } }),
		);
		expect(result.current.peers).toEqual([]);

		act(() => {
			listener?.([
				{ peer: { id: "alice" }, cursor: { x: 1, y: 1 } },
				{ peer: { id: "bob" }, cursor: { x: 2, y: 2 } },
			]);
		});
		expect(result.current.peers).toHaveLength(1);
		expect(result.current.peers[0]?.peer.id).toBe("bob");

		act(() => {
			result.current.updateSelf({ cursor: { x: 5, y: 6 } });
		});
		expect(update).toHaveBeenCalledTimes(1);
		expect(update.mock.calls[0]?.[0]).toEqual({
			peer: { id: "alice" },
			cursor: { x: 5, y: 6 },
			selection: undefined,
		});
	});

	it("is a no-op when the source is undefined", () => {
		const { result } = renderHook(() =>
			usePresence(undefined, { self: { id: "alice" } }),
		);
		expect(result.current.peers).toEqual([]);
		// Should not throw.
		act(() => {
			result.current.updateSelf({ cursor: { x: 0, y: 0 } });
		});
	});
});
