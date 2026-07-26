/**
 * @file `@anvilkit/core/testing/editor` CFX surface — the ADR 0005
 * Appendix A shared certification fixtures (PLAN-0020 CORE-P2-011).
 */

export {
	certify,
	resetCfxCoverage,
	uncertifiedFixtures,
} from "./coverage.js";
export {
	CFX_COMPONENT_IDS,
	CFX_FIXTURES,
	CFX_IDS,
	CFX_TOKEN_IDS,
	type CfxFixture,
	cfxFixture,
	type CfxId,
} from "./manifest.js";
