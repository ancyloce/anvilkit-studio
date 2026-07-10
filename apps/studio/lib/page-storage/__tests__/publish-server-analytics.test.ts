/**
 * @file Server-side analytics audit event after publish (PRD 0004). A
 * successful `publish()` must record a server-side `page_published`
 * (`server_side: true`, primitive props only); a validation/storage failure
 * must record nothing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	clearAnalyticsEvents,
	getRecordedAnalyticsEventsByName,
} from "../../analytics/store";
import { MemoryPageStorageAdapter } from "../memory-page-storage-adapter";
import { publish } from "../page-api";
import { pageData } from "./adapter-contract";

let counter = 0;
function freshStorage(): MemoryPageStorageAdapter {
	counter = 0;
	return new MemoryPageStorageAdapter({ idFactory: () => `id-${++counter}` });
}

beforeEach(() => clearAnalyticsEvents());

describe("publish() — server-side analytics fallback", () => {
	it("records a server-side page_published after a successful publish", async () => {
		const storage = freshStorage();
		const result = await publish(storage, {
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		expect(result.status).toBe(200);

		const events = getRecordedAnalyticsEventsByName("page_published");
		expect(events).toHaveLength(1);
		const e = events[0];
		expect(e?.source).toBe("studio");
		expect(e?.page_id).toBe("id-1");
		expect(e?.properties).toMatchObject({
			status_change: "published",
			server_side: true,
			slug: "home",
		});
		// Forbidden-fields rule: primitive props only, never the document.
		for (const v of Object.values(e?.properties ?? {})) {
			expect(["string", "number", "boolean"]).toContain(typeof v);
		}
		expect(JSON.stringify(e)).not.toContain("Hero"); // no page content leaked
	});

	it("records NO event when the publish payload fails validation", async () => {
		const storage = freshStorage();
		const bad = {
			root: { props: pageData("home", "Home").root.props },
			content: "nope",
		};
		const result = await publish(storage, { slug: "home", data: bad });
		expect(result.status).toBe(400);
		expect(getRecordedAnalyticsEventsByName("page_published")).toHaveLength(0);
		// And nothing was written to storage either.
		expect(await storage.getBySlug("home")).toBeNull();
	});
});
