/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		externalDir: true,
	},
	transpilePackages: [
		"@anvilkit/bento-grid",
		"@anvilkit/blog-list",
		"@anvilkit/core",
		"@anvilkit/hero",
		"@anvilkit/helps",
		"@anvilkit/logo-clouds",
		"@anvilkit/navbar",
		"@anvilkit/pricing-minimal",
		"@anvilkit/section",
		"@anvilkit/statistics",
		"@anvilkit/ui",
	],
};

export default nextConfig;
