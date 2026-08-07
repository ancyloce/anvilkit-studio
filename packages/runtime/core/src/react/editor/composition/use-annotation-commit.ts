"use client";

/**
 * @file `useAnnotationCommit` — the composition boundary's layer
 * rename/lock hook (PLAN-0026 §3.6, `p3-006`). Thin `useGetPuck`
 * adapter over `commitAnnotationUpdate`; a rename is one history entry
 * and a lock is one history entry.
 */

import { useGetPuck } from "@puckeditor/core";
import { useCallback } from "react";
import type {
	AnnotationCommitResult,
	AnnotationEdit,
} from "../../../puck/update-annotations.js";
import { commitAnnotationUpdate } from "../../../puck/update-annotations.js";

/** Returns a stable annotation committer bound to the live PuckApi. */
export function useAnnotationCommit(): (
	edit: AnnotationEdit,
) => AnnotationCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(edit: AnnotationEdit) =>
			commitAnnotationUpdate({ getPuckApi: getPuck }, edit),
		[getPuck],
	);
}
