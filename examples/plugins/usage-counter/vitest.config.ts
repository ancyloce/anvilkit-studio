import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "@anvilkit/example-usage-counter",
		environment: "node",
		globals: false,
		include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
		passWithNoTests: false,
	},
});
