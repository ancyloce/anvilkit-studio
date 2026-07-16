/**
 * @file Tests for `deriveSaveStatus` — the compact 4-state model behind
 * the header's save-status chip (task Phase 2). Exported so the
 * priority ordering (saving > error > saved > unsaved) can be pinned
 * without mounting the full chrome — same convention as
 * `hasHeaderActionCapability` / `selectCollaboratorsSlot`.
 */

import { describe, expect, it } from "vitest";
import { deriveSaveStatus } from "@/layout/StudioHeader.logic";

describe("deriveSaveStatus", () => {
	it("is 'saving' whenever isSavingDraft is true, regardless of other inputs", () => {
		expect(
			deriveSaveStatus({
				isSavingDraft: true,
				saveError: new Error("boom"),
				lastSavedAt: new Date(),
			}),
		).toBe("saving");
	});

	it("is 'error' when saveError is set and not saving", () => {
		expect(
			deriveSaveStatus({
				isSavingDraft: false,
				saveError: new Error("boom"),
				lastSavedAt: new Date(),
			}),
		).toBe("error");
	});

	it("treats a null saveError as no error", () => {
		expect(
			deriveSaveStatus({
				isSavingDraft: false,
				saveError: null,
				lastSavedAt: new Date(),
			}),
		).toBe("saved");
	});

	it("is 'saved' when lastSavedAt is set and there is no error/saving", () => {
		expect(
			deriveSaveStatus({
				isSavingDraft: false,
				saveError: undefined,
				lastSavedAt: new Date(),
			}),
		).toBe("saved");
	});

	it("is 'unsaved' when nothing else applies", () => {
		expect(
			deriveSaveStatus({
				isSavingDraft: false,
				saveError: undefined,
				lastSavedAt: null,
			}),
		).toBe("unsaved");
	});
});
