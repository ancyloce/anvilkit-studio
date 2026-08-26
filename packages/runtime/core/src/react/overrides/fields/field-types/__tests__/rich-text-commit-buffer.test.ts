import { afterEach, describe, expect, it, vi } from "vitest";

import { createRichTextCommitBuffer } from "../rich-text-commit-buffer";

afterEach(() => {
	vi.useRealTimers();
});

describe("createRichTextCommitBuffer", () => {
	it("serializes and commits only the latest update in each interval", () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		let html = "<p>first</p>";
		const snapshot = { getHTML: vi.fn(() => html) };
		const buffer = createRichTextCommitBuffer(commit, 100);

		buffer.schedule(snapshot);
		html = "<p>latest</p>";
		buffer.schedule(snapshot);
		vi.advanceTimersByTime(99);

		expect(snapshot.getHTML).not.toHaveBeenCalled();
		expect(commit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);

		expect(snapshot.getHTML).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenCalledOnce();
		expect(commit).toHaveBeenCalledWith("<p>latest</p>");
	});

	it("flushes the latest update immediately and cancels the scheduled commit", () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		const snapshot = { getHTML: vi.fn(() => "<p>done</p>") };
		const buffer = createRichTextCommitBuffer(commit, 100);

		buffer.schedule(snapshot);
		buffer.flush();
		vi.runAllTimers();

		expect(snapshot.getHTML).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenCalledWith("<p>done</p>");
	});

	it("discards a pending update when an external value supersedes it", () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		const buffer = createRichTextCommitBuffer(commit, 100);

		buffer.schedule({ getHTML: () => "<p>stale</p>" });
		buffer.cancel();
		vi.runAllTimers();

		expect(commit).not.toHaveBeenCalled();
	});
});
