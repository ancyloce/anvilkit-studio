import { defineConfig, mergeConfig } from "vitest/config";
import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";

export default mergeConfig(
	reactLibraryPreset,
	defineConfig({
		test: {
			name: "@anvilkit/ui",
		},
	}),
);
