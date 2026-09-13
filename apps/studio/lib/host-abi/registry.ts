"use client";

/**
 * Trusted host dependency registry (AnvilKit DD-05 §6.2; S1-T03 proof, 2026-09-12).
 *
 * Registers the actual React, JSX runtime, ReactDOM, Puck and `@anvilkit/ui`
 * bindings that this bundled Studio client imports, under one host profile,
 * exactly once. The immutable ESM facade modules under
 * `public/host/<hostProfileId>/facades/` re-export these objects through an
 * explicit named-export allowlist, so a remote component module whose bare
 * specifiers were rewritten to those facades shares the host's singleton
 * runtime objects and contexts by construction — a facade never downloads
 * another copy because a version string happens to match.
 *
 * This is ABI integrity checking for approved same-realm code, not isolation:
 * the registry exposes no secret and no command surface, and only trusted
 * facade/bootstrap code is meant to read it. Registration is one-time and
 * immutable; a second bootstrap with the same bindings is a no-op and a
 * mismatched one throws.
 */
import * as AnvilkitUiButton from "@anvilkit/ui/button";
import * as AnvilkitUiLibUtils from "@anvilkit/ui/lib/utils";
import * as AnvilkitUiRainbowButton from "@anvilkit/ui/rainbow-button";
import * as PuckCore from "@puckeditor/core";
import * as React from "react";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";

export const HOST_PROFILE_ID = "studio-host-v1";
export const REGISTRY_ABI_VERSION = "1.0.0";

/**
 * Specifier → the namespace object the host bundle imported. The set is the
 * facade rewrite rules' listed specifiers plus the `@anvilkit/ui` subpaths
 * that the fixed Hero fixture consumes; the `@anvilkit/ui` root is not bound
 * because no approved remote module imports it.
 */
const HOST_BINDINGS: Readonly<Record<string, object>> = Object.freeze({
	react: React,
	"react/jsx-runtime": ReactJsxRuntime,
	"react/jsx-dev-runtime": ReactJsxDevRuntime,
	"react-dom": ReactDom,
	"react-dom/client": ReactDomClient,
	"@puckeditor/core": PuckCore,
	"@anvilkit/ui/button": AnvilkitUiButton,
	"@anvilkit/ui/lib/utils": AnvilkitUiLibUtils,
	"@anvilkit/ui/rainbow-button": AnvilkitUiRainbowButton,
});

export interface HostRegistry {
	readonly hostProfileId: string;
	readonly abiVersion: string;
	readonly specifiers: readonly string[];
	/** Returns the registered namespace or throws; never a partial or lazy copy. */
	resolve(hostProfileId: string, specifier: string): object;
}

declare global {
	// eslint-disable-next-line no-var
	var __anvilkitHostRegistry: HostRegistry | undefined;
}

function createRegistry(): HostRegistry {
	const specifiers = Object.freeze(Object.keys(HOST_BINDINGS));
	return Object.freeze({
		hostProfileId: HOST_PROFILE_ID,
		abiVersion: REGISTRY_ABI_VERSION,
		specifiers,
		resolve(hostProfileId: string, specifier: string): object {
			if (hostProfileId !== HOST_PROFILE_ID) {
				throw new Error(
					`host profile mismatch: facade bound to ${hostProfileId}, registry is ${HOST_PROFILE_ID}`,
				);
			}
			const binding = Object.hasOwn(HOST_BINDINGS, specifier)
				? HOST_BINDINGS[specifier]
				: undefined;
			if (binding === undefined) {
				throw new Error(`no host binding is registered for ${specifier}`);
			}
			return binding;
		},
	});
}

/**
 * Installs the registry on `globalThis` once. Returns the existing registry
 * when it was installed by this same module instance; throws when a different
 * registry already occupies the slot, because two registries in one realm can
 * only mean two host bundles.
 */
export function bootstrapHostRegistry(): HostRegistry {
	const existing = globalThis.__anvilkitHostRegistry;
	if (existing !== undefined) {
		const same =
			existing.hostProfileId === HOST_PROFILE_ID &&
			existing.abiVersion === REGISTRY_ABI_VERSION &&
			existing.resolve(HOST_PROFILE_ID, "react") === React;
		if (!same) {
			throw new Error(
				"a different anvilkit host registry is already installed",
			);
		}
		return existing;
	}
	const registry = createRegistry();
	Object.defineProperty(globalThis, "__anvilkitHostRegistry", {
		value: registry,
		writable: false,
		configurable: false,
		enumerable: false,
	});
	return registry;
}

/** The host-side bindings, for identity assertions in the proof page. */
export function hostBinding(specifier: string): object | undefined {
	return HOST_BINDINGS[specifier];
}
