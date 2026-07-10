/**
 * Ambient module declarations for non-TypeScript assets imported as
 * side-effects (e.g. co-located stylesheets). Keeps `tsc --noEmit`
 * green without altering bundler resolution.
 */

declare module "*.css";
