"use client";

/**
 * @file `useInteractionsCommit` / `useBindingsCommit` /
 * `useInlineTextCommit` — the composition boundary's carrier write
 * hooks (PLAN-0026 §3.4, `p3-004`).
 *
 * Thin `useGetPuck` adapters over the pure commit helpers, shaped
 * exactly like `use-appearance-commit.ts` and
 * `use-design-system-commit.ts`: the hook holds nothing, the pure
 * module decides everything, and one intent is at most one
 * history-recording `setData`.
 *
 * `data` and `config` come from the live `PuckApi`, never the caller —
 * the input types are `Omit<…Input, "data" | "config">` — so a caller
 * cannot commit against a document it merely happens to be holding.
 */

import type { Binding, Interaction } from "@anvilkit/contracts/editor";
import { useGetPuck } from "@puckeditor/core";
import { useCallback } from "react";
import type {
	CarrierCommitResult,
	UpdateInlineTextInput,
} from "../../../puck/update-carriers.js";
import {
	commitBindingsUpdate,
	commitInlineTextUpdate,
	commitInteractionsUpdate,
} from "../../../puck/update-carriers.js";

/** Returns a stable interactions committer bound to the live PuckApi. */
export function useInteractionsCommit(): (
	nodeId: string,
	update: (current: readonly Interaction[]) => readonly Interaction[],
) => CarrierCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(nodeId, update) =>
			commitInteractionsUpdate({ getPuckApi: getPuck }, nodeId, update),
		[getPuck],
	);
}

/** Returns a stable bindings committer bound to the live PuckApi. */
export function useBindingsCommit(): (
	nodeId: string,
	update: (current: readonly Binding[]) => readonly Binding[],
) => CarrierCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(nodeId, update) =>
			commitBindingsUpdate({ getPuckApi: getPuck }, nodeId, update),
		[getPuck],
	);
}

/** Returns a stable inline-text committer bound to the live PuckApi. */
export function useInlineTextCommit(): (
	input: Omit<UpdateInlineTextInput, "data" | "config">,
) => CarrierCommitResult {
	const getPuck = useGetPuck();
	return useCallback(
		(input) => commitInlineTextUpdate({ getPuckApi: getPuck }, input),
		[getPuck],
	);
}
