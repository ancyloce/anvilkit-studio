/**
 * PLAN-0036 P1-12 — the DOC-02 §12 conformance suite, run against every
 * provider the app can build today.
 *
 * MockProvider is the only implemented provider in P1; AgentService joins
 * this file at P2-07 (against staging) without the suite changing, which
 * is the whole point of parameterizing it.
 */
import { describe } from "vitest";
import { runProviderConformance } from "../generation/__tests__/provider-conformance";
import { createMockProvider } from "../generation/mock-provider";

describe("MockProvider — DOC-02 §12 conformance", () => {
	runProviderConformance({
		create: () => createMockProvider(),
		// Mock must be deterministic: the fixture matcher is tokenized, and
		// non-determinism here would make every prompt snapshot flaky.
		deterministic: true,
		hasEvents: true,
	});
});
