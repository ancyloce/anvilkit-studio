#!/usr/bin/env node
/**
 * @file `check-peer-deps` — quality gate for `core-015`.
 *
 * Enforces the peer-dependency contract for `@anvilkit/core`:
 *
 * 1. `react`, `react-dom`, and `@puckeditor/core` **must** appear in
 *    `peerDependencies` — they are consumer-provided and never bundled.
 * 2. The same three packages **must NOT** appear in `dependencies` —
 *    if they do, `pnpm install` resolves two copies and the React
 *    invalid-hook-call error fires at runtime.
 *
 * Both halves of the contract matter. A naive reviewer sometimes
 * moves `react` into `dependencies` to "silence a warning" — this
 * script catches that immediately.
 *
 * devDependencies are left untouched: pinning `react` there (for
 * local tests and Rslib builds) is both allowed and expected.
 *
 * @see {@link ../docs/tasks/core-015-public-api-gates.md | core-015}
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON = resolve(PACKAGE_ROOT, "package.json");

/** Packages that must live in `peerDependencies` and nowhere else. */
const REQUIRED_PEERS = ["react", "react-dom", "@puckeditor/core"];

async function main() {
	const raw = await readFile(PACKAGE_JSON, "utf8");
	const pkg = JSON.parse(raw);

	const peers = pkg.peerDependencies ?? {};
	const deps = pkg.dependencies ?? {};

	const missingFromPeers = [];
	const leakedToDeps = [];

	for (const name of REQUIRED_PEERS) {
		if (!(name in peers)) {
			missingFromPeers.push(name);
		}
		if (name in deps) {
			leakedToDeps.push(name);
		}
	}

	if (missingFromPeers.length === 0 && leakedToDeps.length === 0) {
		console.log(
			`check-peer-deps: OK — ${REQUIRED_PEERS.join(", ")} are declared as peers and absent from dependencies.`,
		);
		return;
	}

	console.error("check-peer-deps: FAIL");
	console.error("");
	if (missingFromPeers.length > 0) {
		console.error(
			`  Missing from peerDependencies: ${missingFromPeers.join(", ")}`,
		);
		console.error(
			`  Add each under \"peerDependencies\" in packages/core/package.json.`,
		);
	}
	if (leakedToDeps.length > 0) {
		console.error(
			`  Leaked into dependencies: ${leakedToDeps.join(", ")}`,
		);
		console.error(
			`  Remove from \"dependencies\" — having React in dependencies forces a second React copy in host apps.`,
		);
	}
	process.exit(1);
}

main().catch((err) => {
	console.error("check-peer-deps: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
