import { afterEach, describe, expect, it } from "vitest";

import { promptText } from "../../utils/prompt.js";

const originalArgv = [...process.argv];
const stdinIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

afterEach(() => {
	process.argv = [...originalArgv];
	if (stdinIsTTYDescriptor !== undefined) {
		Object.defineProperty(process.stdin, "isTTY", stdinIsTTYDescriptor);
		return;
	}
	Object.defineProperty(process.stdin, "isTTY", {
		configurable: true,
		value: undefined,
	});
});

describe("promptText", () => {
	it("throws CliError in non-interactive mode", async () => {
		process.argv = ["node", "vitest"];
		process.env.CI = undefined;
		Object.defineProperty(process.stdin, "isTTY", {
			configurable: true,
			value: false,
		});

		await expect(
			promptText({
				message: "target directory",
				defaultValue: "anvilkit-site",
			}),
		).rejects.toMatchObject({
			code: "MISSING_FLAG",
			exitCode: 2,
			message: "Missing target directory; pass a flag for non-TTY use.",
		});
	});
});
