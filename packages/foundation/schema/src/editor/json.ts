/**
 * @file JSON value schema shared by component props, overrides, and
 * binding fallbacks (PLAN-0020 CORE-P0-005D).
 */

import type { JsonValue } from "@anvilkit/contracts/editor";
import { z } from "zod";

/** A JSON-serializable value (recursive). */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().refine((v) => Number.isFinite(v), {
			message: "must be a finite number",
		}),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);
