/**
 * StudioBridge loader for exact remote component releases (AnvilKit DD-05
 * §2–§3, P20).
 *
 * For one editing session it turns a page's component lock into a
 * session-local Puck `Config`:
 *
 * 1. every lock entry is resolved by its exact `releaseId` from the release
 *    source — never "latest" of a catalog; the browser manifest must hash to
 *    the lock's `browserManifestDigest`, name the same identity and this host
 *    profile, and its entry module and stylesheets must match their digests;
 * 2. the entry may import only this host profile's registered specifiers,
 *    which are rewritten to the host's facade modules; stylesheets are
 *    installed before the module is imported, from the verified bytes;
 * 3. every locked `puckType` is reserved before the built-in components: a
 *    built-in of the same name is left out of this session's Config (a type
 *    collision is reported, never resolved by picking one silently);
 * 4. a release that cannot be loaded, a lock this build cannot read and a
 *    node of a type nobody provides each get a safe placeholder that keeps
 *    the node, its id and all its props — no entry is omitted, no other
 *    component's defaults or resolvers are borrowed, nothing is upgraded.
 *
 * Approved remote modules run in the Studio's own realm (they gain no
 * isolation from being fetched); unapproved code never reaches this loader,
 * it is previewed in the separate-origin frame.
 */
import type { ComponentConfig, Config } from "@puckeditor/core";
import type {
	RemoteComponentLockEntry,
	RemoteComponentLockRead,
} from "./remote-component-lock";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RELATIVE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/**
 * The browser manifest of one release (DEVELOPMENT_ONLY shape until the
 * release contract of P21 names it): the exact identity, the host profile,
 * the entry module and its stylesheets with digests and sizes.
 */
export interface BrowserManifest {
	readonly schemaVersion: 1;
	readonly hostProfileId: string;
	readonly identity: {
		readonly componentId: string;
		readonly puckType: string;
		readonly releaseId: string;
		readonly packageName: string;
		readonly packageVersion: string;
	};
	readonly entry: ManifestFile;
	readonly styles: readonly ManifestFile[];
}

export interface ManifestFile {
	readonly path: string;
	readonly digest: string;
	readonly sizeBytes: string;
}

/** Where release bytes come from: the exact release's files by relative path. */
export interface ReleaseSource {
	fetchFile(releaseId: string, path: string): Promise<Uint8Array>;
}

export type LoadOutcome =
	| {
			readonly kind: "loaded";
			readonly entry: RemoteComponentLockEntry;
			readonly config: ComponentConfig;
	  }
	| {
			readonly kind: "unavailable";
			readonly entry: RemoteComponentLockEntry;
			readonly reason: string;
	  };

export class ReleaseRejected extends Error {}

export async function sha256(bytes: Uint8Array): Promise<string> {
	const sum = new Uint8Array(
		await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
	);
	return `sha256:${Array.from(sum, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFile(value: unknown): value is ManifestFile {
	return (
		isRecord(value) &&
		typeof value.path === "string" &&
		RELATIVE.test(value.path) &&
		!value.path.split("/").includes("..") &&
		typeof value.digest === "string" &&
		DIGEST.test(value.digest) &&
		typeof value.sizeBytes === "string" &&
		/^(0|[1-9][0-9]{0,15})$/.test(value.sizeBytes)
	);
}

/**
 * Verifies the manifest bytes against the lock entry: digest, shape,
 * identity and host profile. Returns the parsed manifest or throws.
 */
export async function verifyManifest(
	bytes: Uint8Array,
	entry: RemoteComponentLockEntry,
	hostProfileId: string,
): Promise<BrowserManifest> {
	if ((await sha256(bytes)) !== entry.browserManifestDigest) {
		throw new ReleaseRejected(
			"browser manifest does not match the locked digest",
		);
	}
	let manifest: unknown;
	try {
		manifest = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(bytes),
		);
	} catch {
		throw new ReleaseRejected("browser manifest is not JSON");
	}
	if (
		!isRecord(manifest) ||
		manifest.schemaVersion !== 1 ||
		!isRecord(manifest.identity) ||
		!isFile(manifest.entry) ||
		!Array.isArray(manifest.styles) ||
		manifest.styles.length > 16 ||
		!manifest.styles.every(isFile)
	) {
		throw new ReleaseRejected("browser manifest is malformed");
	}
	const id = manifest.identity;
	for (const key of [
		"componentId",
		"puckType",
		"releaseId",
		"packageName",
		"packageVersion",
	] as const) {
		if (id[key] !== entry[key]) {
			throw new ReleaseRejected(`browser manifest names another ${key}`);
		}
	}
	if (manifest.hostProfileId !== entry.hostProfileId) {
		throw new ReleaseRejected("browser manifest names another host profile");
	}
	if (entry.hostProfileId !== hostProfileId) {
		throw new ReleaseRejected(
			`release was built for host profile ${entry.hostProfileId}, this host is ${hostProfileId}`,
		);
	}
	return manifest as unknown as BrowserManifest;
}

export async function verifyFile(
	bytes: Uint8Array,
	file: ManifestFile,
): Promise<void> {
	if (
		String(bytes.byteLength) !== file.sizeBytes ||
		(await sha256(bytes)) !== file.digest
	) {
		throw new ReleaseRejected(
			`${file.path} does not match its digest and size`,
		);
	}
}

/** The facade module path of one registered specifier (`@a/b-c` → `a-b-c.js`). */
export function facadePath(hostProfileId: string, specifier: string): string {
	return `/host/${hostProfileId}/facades/${specifier.replace(/^@/, "").replaceAll("/", "-")}.js`;
}

const STATIC_IMPORT =
	/(\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*(?:\*|\{[^}]*\})\s*from\s*)(["'])([^"']+)\2/g;

/**
 * Rewrites the entry's static imports of registered specifiers to absolute
 * facade URLs. Any other import, a relative one or a dynamic `import(` is
 * refused: the module must be a single self-contained ESM file against the
 * host ABI.
 */
export function rewriteImports(
	text: string,
	origin: string,
	hostProfileId: string,
	specifiers: readonly string[],
): string {
	if (/\bimport\s*\(/.test(text) || /\brequire\s*\(/.test(text)) {
		throw new ReleaseRejected("entry loads code dynamically");
	}
	return text.replace(
		STATIC_IMPORT,
		(_match, head: string, quote: string, spec: string) => {
			if (!specifiers.includes(spec)) {
				throw new ReleaseRejected(
					`entry imports ${spec}, which the host profile does not provide`,
				);
			}
			return `${head}${quote}${origin}${facadePath(hostProfileId, spec)}${quote}`;
		},
	);
}

/** The component config a loaded module offers (`default` or `componentConfig`). */
export function componentConfigOf(
	module: Record<string, unknown>,
): ComponentConfig {
	const candidate = isRecord(module.default)
		? module.default
		: module.componentConfig;
	if (!isRecord(candidate) || typeof candidate.render !== "function") {
		throw new ReleaseRejected(
			"module offers no component config with a render function",
		);
	}
	if (candidate.defaultProps !== undefined) {
		const round = JSON.stringify(candidate.defaultProps);
		if (round === undefined || JSON.stringify(JSON.parse(round)) !== round) {
			throw new ReleaseRejected("defaultProps are not static JSON");
		}
	}
	return candidate as unknown as ComponentConfig;
}

export type PlaceholderReason =
	| {
			readonly kind: "unavailable";
			readonly entry: RemoteComponentLockEntry;
			readonly detail: string;
	  }
	| { readonly kind: "unlocked"; readonly detail: string };

export type PlaceholderRender = (props: {
	readonly puckType: string;
	readonly reason: PlaceholderReason;
}) => ReturnType<ComponentConfig["render"]>;

/**
 * A safe placeholder for a type this session cannot render. It declares no
 * fields, no defaults and no resolvers, so Puck keeps every prop of the node
 * as it is (the node id included); it cannot be inserted or duplicated, and
 * its props are not editable. Deleting or moving the node stays an explicit
 * author decision.
 */
export function placeholderConfig(
	puckType: string,
	reason: PlaceholderReason,
	render: PlaceholderRender,
): ComponentConfig {
	return {
		label: `${puckType} (unavailable)`,
		fields: {},
		permissions: { insert: false, duplicate: false, edit: false },
		render: () => render({ puckType, reason }),
	} as unknown as ComponentConfig;
}

/** Every component type a Puck document uses: content, legacy zones and slot props. */
export function collectTypes(data: unknown): Set<string> {
	const out = new Set<string>();
	const seen = new Set<unknown>();
	const visit = (value: unknown): void => {
		if (typeof value !== "object" || value === null || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		const record = value as Record<string, unknown>;
		if (typeof record.type === "string" && isRecord(record.props))
			out.add(record.type);
		for (const [key, child] of Object.entries(record)) {
			if (key === "root") {
				// Root props hold page metadata and the lock itself, not nodes;
				// slots under root.props are still walked.
				if (isRecord(child) && isRecord(child.props)) visit(child.props);
				continue;
			}
			visit(child);
		}
	};
	if (isRecord(data)) {
		visit(data.content);
		visit(data.zones);
		if (isRecord(data.root) && isRecord(data.root.props)) {
			for (const [key, child] of Object.entries(data.root.props)) {
				if (key !== "remoteComponentLock" && key !== "componentLibrary")
					visit(child);
			}
		}
	}
	return out;
}

export interface SessionConfig {
	readonly config: Config;
	/** Built-in types a locked remote type displaced in this session. */
	readonly collisions: readonly string[];
	/** Types rendered as placeholders, with why. */
	readonly placeholders: readonly {
		readonly puckType: string;
		readonly reason: PlaceholderReason;
	}[];
	/** Types the lock loaded from their exact release. */
	readonly remote: readonly string[];
}

/**
 * Assembles the session-local Config: locked types first (remote config or
 * placeholder), then the built-ins that no lock reserved, then placeholders
 * for any node type nobody provides.
 */
export function buildSessionConfig(
	base: Config,
	lock: RemoteComponentLockRead,
	outcomes: readonly LoadOutcome[],
	data: unknown,
	render: PlaceholderRender,
): SessionConfig {
	const components: Record<string, ComponentConfig> = {};
	const collisions: string[] = [];
	const placeholders: { puckType: string; reason: PlaceholderReason }[] = [];
	const remote: string[] = [];
	const builtIns = base.components as Record<string, ComponentConfig>;
	const byType = new Map(outcomes.map((o) => [o.entry.puckType, o]));
	if (lock.state === "valid") {
		for (const entry of lock.lock.entries) {
			const outcome = byType.get(entry.puckType);
			if (Object.hasOwn(builtIns, entry.puckType))
				collisions.push(entry.puckType);
			if (
				outcome?.kind === "loaded" &&
				outcome.entry.releaseId === entry.releaseId
			) {
				components[entry.puckType] = outcome.config;
				remote.push(entry.puckType);
			} else {
				const reason: PlaceholderReason = {
					kind: "unavailable",
					entry,
					detail:
						outcome?.kind === "unavailable"
							? outcome.reason
							: "release not loaded",
				};
				components[entry.puckType] = placeholderConfig(
					entry.puckType,
					reason,
					render,
				);
				placeholders.push({ puckType: entry.puckType, reason });
			}
		}
	}
	for (const [type, config] of Object.entries(builtIns)) {
		if (!Object.hasOwn(components, type)) components[type] = config;
	}
	for (const type of collectTypes(data)) {
		if (Object.hasOwn(components, type)) continue;
		const reason: PlaceholderReason = {
			kind: "unlocked",
			detail:
				lock.state === "unreadable"
					? `the page's component lock is unreadable (${lock.reason})`
					: "no built-in component and no lock entry provides this type",
		};
		components[type] = placeholderConfig(type, reason, render);
		placeholders.push({ puckType: type, reason });
	}
	const categories = base.categories
		? Object.fromEntries(
				Object.entries(base.categories).map(([key, category]) => [
					key,
					{
						...category,
						components: (category.components ?? []).filter(
							(c) => !collisions.includes(String(c)),
						),
					},
				]),
			)
		: undefined;
	const extraCategory =
		remote.length > 0
			? { remote: { title: "Remote components", components: remote } }
			: {};
	if (
		remote.length === 0 &&
		placeholders.length === 0 &&
		collisions.length === 0
	) {
		// Nothing remote, missing or displaced: the session uses the host's own
		// Config object unchanged.
		return { config: base, collisions, placeholders, remote };
	}
	return {
		config: {
			...base,
			...(categories || remote.length > 0
				? { categories: { ...(categories ?? {}), ...extraCategory } }
				: {}),
			components,
		} as Config,
		collisions,
		placeholders,
		remote,
	};
}

/**
 * The host Config extended with an inert entry for every node type of
 * `data` that no built-in provides (locked remote types and unknown types),
 * built-ins unchanged. The document guard checks structure against it, so a
 * page that uses remote or unknown types is admitted for placeholder
 * loading instead of being refused as a whole.
 */
export function withDocumentTypes(base: Config, data: unknown): Config {
	const builtIns = base.components as Record<string, ComponentConfig>;
	const extra: Record<string, ComponentConfig> = {};
	for (const type of collectTypes(data)) {
		if (!Object.hasOwn(builtIns, type)) {
			extra[type] = {
				fields: {},
				render: () => null,
			} as unknown as ComponentConfig;
		}
	}
	return Object.keys(extra).length === 0
		? base
		: ({ ...base, components: { ...extra, ...builtIns } } as Config);
}
