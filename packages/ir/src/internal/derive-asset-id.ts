/**
 * Derive a deterministic, stable id for an asset URL.
 *
 * Uses a simple FNV-1a–style hash so the same URL always maps to the
 * same id across runs. The result is a hex string prefixed with
 * `"asset-"` for easy identification in logs and snapshots.
 *
 * This helper is shared between `puckDataToIR` and `collectAssets`;
 * it lives under `internal/` so it is NOT part of the public surface.
 *
 * @internal
 */
export function deriveAssetId(url: string): string {
	// FNV-1a 32-bit
	let hash = 0x811c9dc5;
	for (let i = 0; i < url.length; i++) {
		hash ^= url.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	const hex = (hash >>> 0).toString(16).padStart(8, "0");
	return `asset-${hex}`;
}
