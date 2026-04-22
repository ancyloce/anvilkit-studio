import { defineConfig } from "../../src/utils/define-anvilkit-config.js";

export default defineConfig({
	generatePage: async () => ({
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "unknown-hero",
					type: "UnknownHero",
					props: {},
				},
			],
		},
		assets: [],
		metadata: {
			createdAt: "2026-04-21T00:00:00.000Z",
		},
	}),
});
