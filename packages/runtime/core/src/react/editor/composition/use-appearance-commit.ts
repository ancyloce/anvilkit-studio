"use client";

/**
 * @file `useAppearanceCommit` — the composition boundary's write hook
 * (PLAN-0025 §8.2–§8.3, P2-04). A thin `useGetPuck` adapter over the
 * pure `commitAppearanceUpdate`: callbacks retrieve the latest PuckApi
 * (no stale closures), and every invocation is one intent → at most
 * one history-recording `setData` dispatch.
 */

import { useGetPuck } from "@puckeditor/core";
import { useCallback } from "react";
import type {
	AppearanceCommitResult,
	UpdateAppearanceInput,
} from "../../../puck/update-appearance.js";
import { commitAppearanceUpdate } from "../../../puck/update-appearance.js";

/** One appearance intent, committed against the live document. */
export type AppearanceCommitInput = Omit<UpdateAppearanceInput, "data">;

/** Returns a stable committer bound to the live PuckApi. */
export function useAppearanceCommit(): (
	input: AppearanceCommitInput,
) => AppearanceCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(input: AppearanceCommitInput) =>
			commitAppearanceUpdate({ getPuckApi: getPuck }, input),
		[getPuck],
	);
}
