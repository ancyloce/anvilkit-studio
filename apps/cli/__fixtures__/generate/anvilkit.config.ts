import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";

import { defineConfig } from "../../src/utils/define-anvilkit-config.js";

export default defineConfig({
	generatePage: createMockGeneratePage(),
});
