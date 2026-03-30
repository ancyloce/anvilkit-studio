/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		externalDir: true,
	},
	transpilePackages: [
		"@anvilkit/hero",
		"@anvilkit/logo-clouds",
		"@anvilkit/navbar",
		"@anvilkit/ui",
	],
};

export default nextConfig;
