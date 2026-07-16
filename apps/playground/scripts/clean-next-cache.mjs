import { rmSync } from "node:fs";

rmSync(new URL("../.next/cache", import.meta.url), {
	force: true,
	recursive: true,
});
