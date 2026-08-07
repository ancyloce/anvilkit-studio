"use client";

/**
 * @file `useComponentLibraryCommit` — the composition boundary's
 * component-library write hook (PLAN-0026 §3.4, §3.8.1; `p3-001`).
 * Thin `useGetPuck` adapter over the pure
 * `commitComponentLibraryUpdate`; one intent → at most one
 * history-recording `setData` dispatch, so a definition create, update
 * or delete is exactly one undo step.
 *
 * Shaped exactly like `use-design-system-commit.ts` and
 * `use-appearance-commit.ts` — same `useGetPuck` binding, same stable
 * `useCallback`, same "the hook holds nothing, the pure module decides
 * everything" split. The commit input is
 * `Omit<UpdateComponentLibraryInput, "data" | "config">`: `data` and
 * `config` come from the live `PuckApi`, never from the caller, so a
 * caller cannot commit against a document it merely happens to be
 * holding.
 */

import { useGetPuck } from "@puckeditor/core";
import { useCallback } from "react";
import type {
	ComponentLibraryCommitResult,
	ComponentLibraryEdit,
} from "../../../puck/update-component-library.js";
import { commitComponentLibraryUpdate } from "../../../puck/update-component-library.js";

/** Returns a stable committer bound to the live PuckApi. */
export function useComponentLibraryCommit(): (
	edit: ComponentLibraryEdit,
) => ComponentLibraryCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(edit: ComponentLibraryEdit) =>
			commitComponentLibraryUpdate({ getPuckApi: getPuck }, edit),
		[getPuck],
	);
}
