/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		externalDir: true,
	},
	transpilePackages: [
		"@anvilkit/button",
		"@anvilkit/hero",
		"@anvilkit/input",
		"@anvilkit/navbar",
		"@anvilkit/ui",
	],
};

export default nextConfig;
