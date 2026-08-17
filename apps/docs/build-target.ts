const DEFAULT_NITRO_PRESET = "vercel";
const DOCKER_NITRO_PRESET = "node-server";

/**
 * Resolve the hosting-specific parts of the docs build.
 *
 * The long-running node-server image can render routes on demand, so crawling
 * the full localized docs graph during its image build only duplicates work
 * and retains several gigabytes of prerender state. Static hosting keeps the
 * existing prerender behavior.
 */
export function resolveDocsBuildTarget(configuredPreset?: string) {
	const nitroPreset = configuredPreset ?? DEFAULT_NITRO_PRESET;

	return {
		nitroPreset,
		prerender: nitroPreset !== DOCKER_NITRO_PRESET,
	};
}
