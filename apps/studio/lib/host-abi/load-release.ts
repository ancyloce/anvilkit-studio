"use client";

/**
 * Browser step of the StudioBridge loader (P20): loads one locked release
 * into this realm from verified bytes only. The manifest, the stylesheets and
 * the entry are fetched once, checked against the lock and the manifest, and
 * then used from those exact bytes (blob URLs), so nothing fetched afterwards
 * can differ from what was verified. Stylesheets are installed before the
 * module is imported; a failure of any step makes this release unavailable
 * and leaves every other component alone.
 */

import { bootstrapHostRegistry, HOST_PROFILE_ID } from "./registry";
import type { RemoteComponentLockEntry } from "./remote-component-lock";
import {
	componentConfigOf,
	type LoadOutcome,
	type ReleaseSource,
	rewriteImports,
	verifyFile,
	verifyManifest,
} from "./remote-loader";

/**
 * The DEVELOPMENT_ONLY release source: the Studio server's
 * `/api/host/releases/<releaseId>/<path>` route over a local release
 * directory, until ENV-07/08 name the authorized catalog and artifact origin.
 */
export const devReleaseSource: ReleaseSource = {
	async fetchFile(releaseId, path) {
		const response = await fetch(
			`/api/host/releases/${encodeURIComponent(releaseId)}/${path.split("/").map(encodeURIComponent).join("/")}`,
			{ cache: "no-store" },
		);
		if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	},
};

// A bundler cannot analyse a runtime URL; the verified module is imported
// by the browser's own module loader.
const importUrl = new Function("u", "return import(u)") as (
	url: string,
) => Promise<Record<string, unknown>>;

function installStylesheet(
	text: string,
	entry: RemoteComponentLockEntry,
): Promise<void> {
	const url = URL.createObjectURL(new Blob([text], { type: "text/css" }));
	return new Promise((resolve, reject) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = url;
		link.dataset.anvilkitRemoteStyle = entry.puckType;
		link.dataset.anvilkitRelease = entry.releaseId;
		link.onload = () => resolve();
		link.onerror = () => {
			link.remove();
			reject(new Error("stylesheet did not load"));
		};
		document.head.appendChild(link);
	});
}

const loaded = new Map<string, Promise<LoadOutcome>>();

/** Loads one exact release once per realm (a release's bytes never change). */
export function loadRelease(
	entry: RemoteComponentLockEntry,
	source: ReleaseSource = devReleaseSource,
): Promise<LoadOutcome> {
	const key = `${entry.releaseId}|${entry.browserManifestDigest}|${entry.puckType}`;
	const existing = loaded.get(key);
	if (existing) return existing;
	const promise = (async (): Promise<LoadOutcome> => {
		try {
			const registry = bootstrapHostRegistry();
			const manifest = await verifyManifest(
				await source.fetchFile(entry.releaseId, "browser-manifest.json"),
				entry,
				HOST_PROFILE_ID,
			);
			const decoder = new TextDecoder("utf-8", { fatal: true });
			const styles: string[] = [];
			for (const file of manifest.styles) {
				const bytes = await source.fetchFile(entry.releaseId, file.path);
				await verifyFile(bytes, file);
				styles.push(decoder.decode(bytes));
			}
			const entryBytes = await source.fetchFile(
				entry.releaseId,
				manifest.entry.path,
			);
			await verifyFile(entryBytes, manifest.entry);
			const text = rewriteImports(
				decoder.decode(entryBytes),
				window.location.origin,
				HOST_PROFILE_ID,
				registry.specifiers,
			);
			for (const css of styles) await installStylesheet(css, entry);
			const url = URL.createObjectURL(
				new Blob([text], { type: "text/javascript" }),
			);
			try {
				const module = await importUrl(url);
				return { kind: "loaded", entry, config: componentConfigOf(module) };
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch (err) {
			loaded.delete(key);
			return {
				kind: "unavailable",
				entry,
				reason: err instanceof Error ? err.message : String(err),
			};
		}
	})();
	loaded.set(key, promise);
	return promise;
}
