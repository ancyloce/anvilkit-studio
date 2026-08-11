/**
 * @file The engine's single definition of "what a token reference
 * looks like" (PLAN-0020 CORE-P2-003).
 *
 * `p3-009` reduced this module to that one predicate. Everything else
 * it held — `mapAuthoringTokens` and its spec / family / instance /
 * definition walkers, plus the `TokenUsageSite` and `TokenRefVisitor`
 * vocabulary they travelled on — existed to rewrite token ids across
 * the sidecar's flat record map. That map is gone; token references
 * now live in each node's own `appearance` carrier, and rewriting them
 * is `puck/update-appearance.ts`'s job.
 *
 * `isTokenRef` survives because three separate readers need to agree
 * on the answer and must not each re-spell it: `resolve/node.ts`,
 * `document-model/read-node-field.ts`, and
 * `composition/design-system/read-design-system.ts`.
 */

/** The authoring families that can carry token references. */
export type TokenReferenceFamily = "layout" | "style" | "typography";

/** True for a `{kind:"token", tokenId}` reference node (§9.3). */
export function isTokenRef(
	value: unknown,
): value is { kind: "token"; tokenId: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === "token" &&
		typeof (value as { tokenId?: unknown }).tokenId === "string"
	);
}
