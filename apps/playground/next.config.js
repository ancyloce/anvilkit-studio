/**
 * Compatibility app: consumes `@anvilkit/*` strictly through their built
 * public exports — no source-path aliases, no `transpilePackages`, no
 * product features. If a package only works here with extra config, that
 * is a compatibility finding, not something to paper over.
 *
 * @type {import("next").NextConfig}
 */
const nextConfig = {};

export default nextConfig;
