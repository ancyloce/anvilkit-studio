import { describe, expect, it } from "vitest";
import {
	formatAccess,
	formatMoney,
	parseAccess,
	parseMoney,
	type RevocationProgress,
	revocationPhase,
} from "../agent/management";

describe("management helpers", () => {
	it("parses and formats access entries", () => {
		const entries = parseAccess("actor:user_a, project:proj_1\nrole:editor");
		expect(entries).toEqual([
			{ principalType: "actor", principalId: "user_a" },
			{ principalType: "project", principalId: "proj_1" },
			{ principalType: "role", principalId: "editor" },
		]);
		expect(formatAccess(entries ?? [])).toBe(
			"actor:user_a, project:proj_1, role:editor",
		);
		expect(parseAccess("")).toEqual([]);
		expect(parseAccess("group:x")).toBeNull();
		expect(parseAccess("actor:")).toBeNull();
	});

	it("keeps money exact at scale 6", () => {
		expect(parseMoney("1.5")).toBe("1500000");
		expect(parseMoney("0")).toBe("0");
		expect(parseMoney("0.000001")).toBe("1");
		expect(parseMoney("1.0000001")).toBeNull();
		expect(parseMoney("-1")).toBeNull();
		expect(formatMoney({ currency: "USD", amount: "1500000" })).toBe(
			"USD 1.500000",
		);
		expect(formatMoney({ currency: "USD", amount: "7" })).toBe("USD 0.000007");
	});

	it("tells blocked admission apart from converged senders", () => {
		const base = {
			inFlightCalls: "1",
			unknownCalls: "0",
			openCalls: "1",
		} as const;
		const p = (o: Partial<RevocationProgress>) =>
			({
				...base,
				newAdmissionBlocked: false,
				sendersConverged: false,
				controlState: "none",
				...o,
			}) as RevocationProgress;
		expect(revocationPhase(p({}))).toBe("active");
		expect(
			revocationPhase(p({ newAdmissionBlocked: true, controlState: "fenced" })),
		).toBe("blocked");
		expect(
			revocationPhase(
				p({ newAdmissionBlocked: true, controlState: "converging" }),
			),
		).toBe("converging");
		expect(
			revocationPhase(
				p({
					newAdmissionBlocked: true,
					sendersConverged: true,
					controlState: "converged",
				}),
			),
		).toBe("converged");
	});
});
