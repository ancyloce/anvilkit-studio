/**
 * @file Token usage tracking (PLAN-0020 CORE-P2-001; ED-TOKEN-002;
 * DD-0019 §15.1).
 *
 * Built on the shared {@link mapAuthoringTokens} walk with a
 * record-only visitor, so the usage index and the deletion rewrite
 * always agree on the site set.
 */

import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { mapAuthoringTokens, type TokenUsageSite } from "./walk.js";

/** Every reference to a token, keyed by the referenced token id. */
export type TokenUsageIndex = ReadonlyMap<string, readonly TokenUsageSite[]>;

/**
 * Index every token reference in the document (ED-TOKEN-002).
 * Tokens with no references are absent from the map rather than
 * mapped to an empty array — use {@link tokenUsageSites} to read.
 */
export function collectTokenUsage(state: AuthoringStateV1): TokenUsageIndex {
	const index = new Map<string, TokenUsageSite[]>();
	mapAuthoringTokens(state, (tokenId, site) => {
		const sites = index.get(tokenId);
		if (sites === undefined) {
			index.set(tokenId, [site]);
		} else {
			sites.push(site);
		}
		// Record-only: never rewrite.
		return undefined;
	});
	return index;
}

/** The sites referencing one token; empty when it is unused. */
export function tokenUsageSites(
	index: TokenUsageIndex,
	tokenId: string,
): readonly TokenUsageSite[] {
	return index.get(tokenId) ?? [];
}

/**
 * The tokens that directly alias `tokenId` (the reverse alias edge).
 * Deleting a token breaks these chains, so the deletion preview lists
 * them separately from ordinary value references.
 */
export function aliasDependents(
	index: TokenUsageIndex,
	tokenId: string,
): readonly string[] {
	return tokenUsageSites(index, tokenId)
		.filter((site) => site.kind === "tokenAlias")
		.map((site) => site.tokenId);
}
