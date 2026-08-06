"use client";

/**
 * @file `useDesignSystemCommit` — the composition boundary's root
 * design-system write hook (PLAN-0025 §8.3, P2-05). Thin `useGetPuck`
 * adapter over the pure `commitDesignSystemUpdate`; one intent → at
 * most one history-recording `setData` dispatch.
 */

import { useGetPuck } from "@puckeditor/core";
import { useCallback } from "react";
import type {
	DesignSystemCommitResult,
	UpdateDesignSystemInput,
} from "../../../puck/update-design-system.js";
import { commitDesignSystemUpdate } from "../../../puck/update-design-system.js";

/** Returns a stable committer bound to the live PuckApi. */
export function useDesignSystemCommit(): (
	update: UpdateDesignSystemInput["update"],
) => DesignSystemCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(update: UpdateDesignSystemInput["update"]) =>
			commitDesignSystemUpdate({ getPuckApi: getPuck }, update),
		[getPuck],
	);
}
