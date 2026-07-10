import { describe, expect, it } from "vitest";
import { API_ERROR, apiFailure, apiSuccess } from "../response";

describe("api response helpers", () => {
	it("apiSuccess wraps data with ok:true", () => {
		expect(apiSuccess({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
	});

	it("apiFailure omits the issues key when none are given", () => {
		const result = apiFailure(API_ERROR.notFound, "nope");
		expect(result).toEqual({
			ok: false,
			code: "E_NOT_FOUND",
			message: "nope",
		});
		expect("issues" in result).toBe(false);
	});

	it("apiFailure includes structured issues when provided", () => {
		const issues = [{ message: "bad", code: "E_PAGE_REQUIRED" }];
		expect(apiFailure(API_ERROR.validation, "bad", issues)).toEqual({
			ok: false,
			code: "E_VALIDATION",
			message: "bad",
			issues,
		});
	});
});
