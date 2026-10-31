// Drift check of the vendored Agent API types (P20). lib/agent/generated/
// agent.ts is the unmodified openapi-typescript output of the platform
// contract (anvilkit-services contracts/ts/src/openapi/agent.ts), vendored
// until @anvilkit/generated-clients is published. This fails when the copy
// differs from the contract source, and reports UNEXECUTED (exit 2) when the
// source is not available here, which is never a pass.
//
//   ANVILKIT_AGENT_CONTRACTS=/path/to/anvilkit-services/contracts node scripts/check-agent-contract.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const vendored = path.join(here, "..", "lib", "agent", "generated", "agent.ts");
const contracts =
	process.env.ANVILKIT_AGENT_CONTRACTS ??
	path.join(here, "..", "..", "..", "..", "anvilkit-services", "contracts");
const source = path.join(contracts, "ts", "src", "openapi", "agent.ts");

if (!existsSync(source)) {
	console.error(`UNEXECUTED: contract source ${source} is not available (set ANVILKIT_AGENT_CONTRACTS)`);
	process.exit(2);
}
if (readFileSync(source, "utf8") !== readFileSync(vendored, "utf8")) {
	console.error(`FAIL: ${path.relative(process.cwd(), vendored)} differs from ${source}; copy the generated file unmodified`);
	process.exit(1);
}
console.log("PASS: vendored Agent API types match the contract source");
