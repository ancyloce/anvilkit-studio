/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@anvilkit/hero", "@anvilkit/navbar", "@anvilkit/ui"],
};

export default nextConfig;
