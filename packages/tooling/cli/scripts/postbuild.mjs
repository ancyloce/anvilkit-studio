import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

chmodSync(
	fileURLToPath(new URL("../dist/bin/anvilkit.mjs", import.meta.url)),
	0o755,
);
