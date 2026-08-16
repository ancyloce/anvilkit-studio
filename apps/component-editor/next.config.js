/** @type {import("next").NextConfig} */
const nextConfig = {
	// better-sqlite3 is a native addon (server-side SQLite page-storage
	// adapter, P0-03). Kept external so standalone traces copy the prebuilt
	// binary instead of bundling (which drops it and crashes at boot).
	serverExternalPackages: ["better-sqlite3"],
	experimental: {
		externalDir: true,
	},
	// `pnpm typecheck` (`next typegen && tsc --noEmit`) is the authoritative
	// type gate in this repo; Next's internal pass is redundant.
	typescript: { ignoreBuildErrors: true },
	transpilePackages: [
		"@anvilkit/badge",
		"@anvilkit/button",
		"@anvilkit/card",
		"@anvilkit/core",
		"@anvilkit/input",
		"@anvilkit/plugin-ai-copilot",
		"@anvilkit/plugin-code-editor",
		"@anvilkit/plugin-design-system",
		"@anvilkit/plugin-export-html",
		"@anvilkit/plugin-export-react",
		"@anvilkit/schema",
		"@anvilkit/select",
		"@anvilkit/separator",
		"@anvilkit/ui",
		"@anvilkit/validator",
	],
};

export default nextConfig;
