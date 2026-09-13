/**
 * The page rail's write-throughs present the page revision through the host's
 * guard (S1-T04 write contract): every create / rename / settings / duplicate /
 * delete runs as `guardedWrite(id, action, perform)`, and `perform` sends the
 * revision the guard hands it. Without a guard the writes make no claim.
 */

import type { PageRootProps } from "@anvilkit/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistResult } from "../page-persistence";
import {
	createPersistedPagesSource,
	type PersistedPagesWriteAction,
} from "../persisted-pages-source";

// The source seeds new pages from the demo showcase document, whose module
// pulls the whole component catalog; a bare document is enough here.
vi.mock("../puck-demo", () => ({
	createDemoData: () => ({
		root: {
			props: {
				title: "Home",
				slug: "home",
				status: "published",
				version: "1.0.0",
				parentFolder: "/",
				seo: { noIndex: false },
			},
		},
		content: [],
		zones: {},
	}),
}));

const rootProps = (title: string, slug: string): PageRootProps => ({
	title,
	slug,
	status: "published",
	version: "1.0.0",
	parentFolder: "/",
	seo: { noIndex: false },
});

let fetchMock: ReturnType<typeof vi.fn>;
// The rail mirrors root-prop patches into the host document; nothing to mirror here.
const noop = vi.fn();
const okResponse = (pageRevision: number): Response =>
	new Response(JSON.stringify({ ok: true, data: { pageRevision } }), {
		status: 200,
	});

beforeEach(() => {
	fetchMock = vi.fn(async () => okResponse(2));
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** A guard that records its calls and hands `perform` a fixed revision. */
function recordingGuard(revision: number) {
	const calls: { id: string; action: PersistedPagesWriteAction }[] = [];
	const settled: Promise<PersistResult>[] = [];
	return {
		calls,
		settled,
		guardedWrite: (
			id: string,
			action: PersistedPagesWriteAction,
			perform: (expected: number) => Promise<PersistResult>,
		): Promise<PersistResult> => {
			calls.push({ id, action });
			const outcome = perform(revision);
			settled.push(outcome);
			return outcome;
		},
	};
}

const sentBody = (index: number): Record<string, unknown> => {
	const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
	return JSON.parse(String(init?.body));
};

describe("persisted pages source — guarded write-throughs", () => {
	it("renames through the guard, presenting the revision it hands out", async () => {
		const guard = recordingGuard(3);
		const props = new Map([["about", rootProps("About", "about")]]);
		const source = createPersistedPagesSource({
			getRootProps: (id) => props.get(id),
			updateRootProps: noop,
			guardedWrite: guard.guardedWrite,
		});

		source.onRename({ id: "about", title: "About Us" });
		await Promise.all(guard.settled);

		expect(guard.calls).toEqual([{ id: "about", action: "rename" }]);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/about/settings");
		expect(sentBody(0)).toMatchObject({
			title: "About Us",
			slug: "about",
			expectedPageRevision: 3,
		});
	});

	it("creates and duplicates with the guard's revision (0 for a record that does not exist yet)", async () => {
		const guard = recordingGuard(0);
		const source = createPersistedPagesSource({
			getRootProps: () => undefined,
			updateRootProps: noop,
			guardedWrite: guard.guardedWrite,
		});

		source.onCreate({ title: "Launch", path: "/launch", route: true });
		await source.onDuplicate("about");
		await Promise.all(guard.settled);

		expect(guard.calls.map((c) => c.action)).toEqual(["create", "duplicate"]);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/publish");
		expect(sentBody(0)).toMatchObject({
			id: guard.calls[0]?.id,
			slug: "launch",
			expectedPageRevision: 0,
		});
		expect(sentBody(1)).toMatchObject({
			id: guard.calls[1]?.id,
			slug: "about-copy",
			expectedPageRevision: 0,
		});
	});

	it("deletes and updates settings through the guard", async () => {
		const guard = recordingGuard(5);
		const props = new Map([["about", rootProps("About", "about")]]);
		const source = createPersistedPagesSource({
			getRootProps: (id) => props.get(id),
			updateRootProps: noop,
			guardedWrite: guard.guardedWrite,
		});

		source.onUpdateSettings({ id: "about", title: "About the team" });
		source.onDelete("about");
		await Promise.all(guard.settled);

		expect(guard.calls).toEqual([
			{ id: "about", action: "settings" },
			{ id: "about", action: "delete" },
		]);
		expect(sentBody(0)).toMatchObject({
			title: "About the team",
			expectedPageRevision: 5,
		});
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"/api/pages/about?expectedPageRevision=5",
		);
	});

	it("makes no claim without a guard", async () => {
		const source = createPersistedPagesSource({
			getRootProps: () => undefined,
			updateRootProps: noop,
		});

		source.onRename({ id: "about", title: "About Us" });
		source.onDelete("about");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		expect(sentBody(0)).not.toHaveProperty("expectedPageRevision");
		expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/pages/about");
	});
});
