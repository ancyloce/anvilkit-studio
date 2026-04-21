/** @type {import("next").NextConfig} */
const nextConfig = {
	experimental: {
		externalDir: true,
	},
	transpilePackages: [
		"@anvilkit/bento-grid",
		"@anvilkit/blog-list",
		"@anvilkit/button",
		"@anvilkit/core",
		"@anvilkit/hero",
		"@anvilkit/helps",
		"@anvilkit/input",
		"@anvilkit/ir",
		"@anvilkit/logo-clouds",
		"@anvilkit/navbar",
		"@anvilkit/plugin-ai-copilot",
		"@anvilkit/plugin-export-html",
		"@anvilkit/plugin-export-react",
		"@anvilkit/pricing-minimal",
		"@anvilkit/schema",
		"@anvilkit/section",
		"@anvilkit/statistics",
		"@anvilkit/ui",
		"@anvilkit/validator",
	],
};

export default nextConfig;
