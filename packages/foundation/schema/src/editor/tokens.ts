/**
 * @file Design token and token mode schemas
 * (PLAN-0020 CORE-P0-005C; DD-0019 §9.4, §15).
 *
 * Alias *shape* is validated here (a non-empty target token id);
 * cycle and depth detection live in the core resolver (§24.5) where
 * the whole token graph is available. Provenance (`source`) is
 * metadata only and round-trips losslessly.
 */

import type { DesignToken, TokenMode } from "@anvilkit/contracts/editor";
import { z } from "zod";
import { IdSchema, limitedRecordSchema } from "./primitives.js";

/** The typed token categories supported in v1. */
export const TokenTypeSchema = z.enum([
	"color",
	"length",
	"number",
	"fontFamily",
	"fontWeight",
	"shadow",
	"radius",
]);

/** A token value for one mode: literal or alias. */
export const TokenValueSchema = z.discriminatedUnion("kind", [
	z.looseObject({ kind: z.literal("literal"), value: z.unknown() }),
	z.looseObject({ kind: z.literal("alias"), tokenId: IdSchema }),
]);

/** Import-as-copy provenance (ADR 0005). */
export const DesignTokenSourceSchema = z.looseObject({
	system: z.enum(["theme", "brand"]),
	ref: z.string().min(1),
});

/** A document-local design token (DD-0019 §9.4, verbatim shape). */
export const DesignTokenSchema: z.ZodType<DesignToken> = z.looseObject({
	id: IdSchema,
	path: z.array(z.string().min(1)),
	name: z.string().min(1),
	type: TokenTypeSchema,
	values: z.record(IdSchema, TokenValueSchema),
	description: z.string().optional(),
	source: DesignTokenSourceSchema.optional(),
});

/** One token mode. */
export const TokenModeSchema: z.ZodType<TokenMode> = z.looseObject({
	id: IdSchema,
	name: z.string().min(1),
});

/** The document token collection (≤2,000 tokens). */
export const TokenCollectionSchema = limitedRecordSchema(
	DesignTokenSchema,
	"tokens",
);

/** The document token-mode collection. */
export const TokenModeCollectionSchema = z.record(IdSchema, TokenModeSchema);
