"use client";

/**
 * AnvilKit S1-T03 host loading proof (DD-05 §6.2, §6.3, §6.5; 2026-09-12).
 *
 * In this production build the page bootstraps the host dependency registry,
 * verifies the delivered component artifacts against their browser manifest,
 * proves that every facade the remote module imports re-exports the host's
 * own objects, installs the component stylesheet before anything mounts,
 * imports the remote Hero module through its rewritten facade imports, and
 * assembles one Puck `Config` for `<Puck>` (edit) and `<Render>` (render).
 * The driver in `anvilkit-services/tools/verify/hero_host_proof.mjs` reads
 * `window.__anvilkitHostProof`, edits the headline through the real field
 * and checks the rendered DOM and computed styles.
 *
 * It is a proof route, not the production loader: it authenticates nothing,
 * resolves no catalog and trusts the manifest it is pointed at.
 */
import type { Config, Data } from "@puckeditor/core";
import { Puck, Render, useGetPuck } from "@puckeditor/core";
import * as React from "react";
import { useEffect, useState } from "react";
import {
	bootstrapHostRegistry,
	HOST_PROFILE_ID,
	hostBinding,
	REGISTRY_ABI_VERSION,
} from "@/lib/host-abi/registry";

interface Check {
	name: string;
	pass: boolean;
	detail?: string;
}

interface ProofRecord {
	phase: string;
	checks: Check[];
	profile: Record<string, unknown>;
	manifest?: unknown;
	loadedScripts?: string[];
	lastData?: Data;
	error?: string;
	select?: () => void;
}

interface RemoteModule {
	componentConfig: Config["components"][string];
	defaultProps: Record<string, unknown>;
	fields: Record<string, unknown>;
	metadata: Record<string, unknown>;
	Hero: unknown;
}

declare global {
	interface Window {
		__anvilkitHostProof?: ProofRecord;
	}
}

const ASSET_BASE = "/host-abi-proof/assets/";
const ProofContext = React.createContext("host-default");

function proofRecord(): ProofRecord {
	if (!window.__anvilkitHostProof) {
		window.__anvilkitHostProof = {
			phase: "created",
			checks: [],
			profile: {
				hostProfileId: HOST_PROFILE_ID,
				registryAbiVersion: REGISTRY_ABI_VERSION,
				react: React.version,
				userAgent: navigator.userAgent,
			},
		};
	}
	return window.__anvilkitHostProof;
}

// A bundler cannot analyse a runtime URL; the remote module and the facades
// are fetched by the browser's own module loader from this origin.
const importUrl: (url: string) => Promise<Record<string, unknown>> = new Function(
	"u",
	"return import(u)",
) as (url: string) => Promise<Record<string, unknown>>;

async function digestOf(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return `sha256:${Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

function installStylesheet(href: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		link.dataset.anvilkitRemoteStyle = "hero";
		link.onload = () => resolve();
		link.onerror = () => reject(new Error(`stylesheet failed to load: ${href}`));
		document.head.appendChild(link);
	});
}

function throws(fn: () => unknown): boolean {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}

/** Inside `<Puck>`: lets the driver select the component like a user click would. */
function PuckBridge({ children }: { children?: React.ReactNode }) {
	const getPuck = useGetPuck();
	useEffect(() => {
		const proof = proofRecord();
		proof.select = () => {
			getPuck().dispatch({
				type: "setUi",
				ui: { itemSelector: { index: 0, zone: "root:default-zone" } },
			});
		};
		proof.phase = "mounted";
	}, [getPuck]);
	return <>{children}</>;
}

/** A consumer whose hooks come from the facade module a remote component would import. */
function FacadeContextConsumer({
	useContextFromFacade,
}: {
	useContextFromFacade: typeof React.useContext;
}) {
	const value = useContextFromFacade(ProofContext);
	return <span data-proof="facade-context">{value}</span>;
}

export function HostAbiProof() {
	const [remote, setRemote] = useState<RemoteModule | null>(null);
	const [facadeReact, setFacadeReact] = useState<Record<string, unknown> | null>(null);
	const [initialData, setInitialData] = useState<Data | null>(null);

	useEffect(() => {
		const proof = proofRecord();
		const check = (name: string, pass: boolean, detail?: string) => {
			proof.checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
		};
		(async () => {
			proof.phase = "bootstrapping";
			const registry = bootstrapHostRegistry();
			check("registry is installed once on the realm", registry === globalThis.__anvilkitHostRegistry);
			check("a second bootstrap returns the same registry", bootstrapHostRegistry() === registry);
			check("the registry rejects a facade bound to another host profile", throws(() => registry.resolve("other-host-v9", "react")));
			check("the registry rejects an unbound specifier", throws(() => registry.resolve(HOST_PROFILE_ID, "lodash")));

			const params = new URLSearchParams(location.search);
			const manifestUrl = params.get("manifest") ?? `${ASSET_BASE}browser-manifest.json`;
			const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
			check("browser manifest is delivered", manifestResponse.ok, String(manifestResponse.status));
			const manifest = (await manifestResponse.json()) as {
				hostProfileId: string;
				entry: { path: string; digest: string; sizeBytes: string };
				styles: { path: string; digest: string; sizeBytes: string }[];
				facadeMap: { bareSpecifier: string; facadeUrl: string; facadeDigest?: string }[];
				identity: { packageName: string; packageVersion: string; puckType: string };
			};
			proof.manifest = manifest;
			check("manifest binds this host profile", manifest.hostProfileId === HOST_PROFILE_ID, manifest.hostProfileId);

			const entryUrl = ASSET_BASE + manifest.entry.path;
			const entryText = await (await fetch(entryUrl, { cache: "no-store" })).text();
			check("delivered entry bytes match the manifest digest and size", (await digestOf(entryText)) === manifest.entry.digest && String(new TextEncoder().encode(entryText).length) === manifest.entry.sizeBytes);
			check("entry imports only host facades of this profile", /^import\s/m.test(entryText) && entryText.split("\n").filter((l) => /^import\s.*from\s/.test(l)).every((l) => l.includes(`/host/${HOST_PROFILE_ID}/facades/`)));
			check("entry carries no second React or CommonJS runtime", !/react\.production|react-dom\.production|__SECRET_INTERNALS|__CLIENT_INTERNALS|require\(/.test(entryText));

			const style = manifest.styles[0];
			if (style === undefined) throw new Error("the manifest lists no stylesheet");
			const styleUrl = ASSET_BASE + style.path;
			const cssText = await (await fetch(styleUrl, { cache: "no-store" })).text();
			check("delivered stylesheet bytes match the manifest digest", (await digestOf(cssText)) === style.digest);

			// Every facade the module imports re-exports the host's own objects.
			for (const entry of manifest.facadeMap) {
				const facadeText = await (await fetch(entry.facadeUrl, { cache: "no-store" })).text();
				check(`facade ${entry.bareSpecifier}: deployed bytes match the certified digest`, entry.facadeDigest === undefined || (await digestOf(facadeText)) === entry.facadeDigest);
				const facade = await importUrl(entry.facadeUrl);
				const binding = hostBinding(entry.bareSpecifier) as Record<string, unknown> | undefined;
				const names = Object.keys(facade).filter((k) => k !== "default");
				const same = binding !== undefined && names.length > 0 && names.every((k) => Object.is(facade[k], binding[k])) && ("default" in facade ? Object.is(facade.default, binding.default) : true);
				check(`facade ${entry.bareSpecifier}: every export is the host's registered object (${names.length} named)`, same);
				if (entry.bareSpecifier === "react") setFacadeReact(facade);
			}
			const reactFacadeUrl = manifest.facadeMap.find((f) => f.bareSpecifier === "react")?.facadeUrl;
			if (reactFacadeUrl) {
				const facade = await importUrl(reactFacadeUrl);
				check("react facade createElement is the host React.createElement", Object.is(facade.createElement, React.createElement));
				check("react facade useContext is the host React.useContext", Object.is(facade.useContext, React.useContext));
			}

			// CSS readiness precedes any mount of the remote component.
			await installStylesheet(styleUrl);
			check("component stylesheet loaded before mount", document.querySelector('link[data-anvilkit-remote-style="hero"]') !== null);

			proof.phase = "importing";
			const module = (await importUrl(entryUrl)) as unknown as RemoteModule;
			check("remote module exports the Puck config surface", typeof module.componentConfig === "object" && typeof module.defaultProps === "object" && typeof module.fields === "object" && typeof module.metadata === "object" && typeof module.Hero === "function");
			check("remote metadata names the certified package", module.metadata.packageName === manifest.identity.packageName && module.metadata.packageVersion === manifest.identity.packageVersion && module.metadata.schemaVersion === 1);
			const roundTrip = JSON.parse(JSON.stringify(module.defaultProps));
			check("defaultProps are static JSON (no functions, undefined or cycles)", JSON.stringify(roundTrip) === JSON.stringify(module.defaultProps) && Object.keys(module.defaultProps).length > 0);
			check("every default prop has a Puck field", Object.keys(module.defaultProps).every((k) => k in module.fields));
			const configFields = (module.componentConfig.fields ?? {}) as Record<string, unknown>;
			check("the component config renders through a function and carries a field per default prop and the same static defaults", typeof module.componentConfig.render === "function" && Object.keys(module.defaultProps).every((k) => k in configFields) && JSON.stringify(module.componentConfig.defaultProps) === JSON.stringify(module.defaultProps));

			const scripts = performance
				.getEntriesByType("resource")
				.map((e) => new URL(e.name).pathname)
				.filter((p) => p.startsWith("/host/") || p.startsWith(ASSET_BASE))
				.filter((p) => p.endsWith(".js"));
			proof.loadedScripts = scripts;
			check("the only remote scripts fetched are the entry and its facades", scripts.every((p) => p === entryUrl || manifest.facadeMap.some((f) => f.facadeUrl === p)) && manifest.facadeMap.every((f) => scripts.includes(f.facadeUrl)));

			setInitialData({
				content: [{ type: manifest.identity.puckType, props: { ...module.defaultProps, id: `${manifest.identity.puckType}-1` } }],
				root: { props: {} },
			});
			setRemote(module);
			proof.phase = "mounting";
		})().catch((error: unknown) => {
			proof.error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
			proof.phase = "failed";
		});
	}, []);

	const firstNode = initialData?.content[0];
	if (!remote || !initialData || firstNode === undefined) {
		return <main data-proof="pending">Host ABI proof: loading the remote component…</main>;
	}
	const config: Config = {
		components: { [firstNode.type]: remote.componentConfig },
		root: { fields: {} },
	};
	return (
		<main data-proof="ready">
			{facadeReact ? (
				<ProofContext.Provider value="host-value">
					<FacadeContextConsumer useContextFromFacade={facadeReact.useContext as typeof React.useContext} />
				</ProofContext.Provider>
			) : null}
			<section id="render-path" data-proof="render">
				<Render config={config} data={initialData} />
			</section>
			<section id="edit-path" data-proof="edit" style={{ height: "80vh" }}>
				<Puck
					config={config}
					data={initialData}
					onChange={(data) => {
						proofRecord().lastData = data;
					}}
					overrides={{
						headerActions: ({ children }) => <PuckBridge>{children}</PuckBridge>,
					}}
				/>
			</section>
		</main>
	);
}
