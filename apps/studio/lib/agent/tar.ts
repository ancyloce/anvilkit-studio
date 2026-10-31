/**
 * @file The source archive the workbench reads and writes (P20): a POSIX
 * ustar archive of regular files under normalized relative paths, the format
 * of the platform's `source` artifact class. Only what the platform itself
 * writes is read: regular files and directory entries; links, devices,
 * absolute or escaping paths, duplicate paths and non-ustar headers are
 * refused, so a hostile archive never becomes a path the editor would write
 * back. Writing is deterministic (sorted paths, fixed mode, owner and mtime),
 * so identical files always give identical bytes and digest.
 */

export interface SourceFile {
	readonly path: string;
	readonly bytes: Uint8Array;
}

const BLOCK = 512;
/** Bounds of one archive the Studio server handles. */
export const MAX_FILES = 512;
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;

export class TarError extends Error {}

const PATH = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;

/** A normalized relative path: no empty, `.` or `..` segments, ≤ 255 bytes. */
export function isSourcePath(path: string): boolean {
	if (!PATH.test(path) || path.length > 255) return false;
	return path.split("/").every((s) => s !== "." && s !== "..");
}

function field(block: Uint8Array, offset: number, length: number): string {
	let end = offset;
	while (end < offset + length && block[end] !== 0) end++;
	return new TextDecoder("utf-8", { fatal: true }).decode(
		block.subarray(offset, end),
	);
}

function octal(block: Uint8Array, offset: number, length: number): number {
	const text = field(block, offset, length).trim();
	if (!/^[0-7]+$/.test(text)) throw new TarError("malformed numeric field");
	return Number.parseInt(text, 8);
}

function checksum(block: Uint8Array): number {
	let sum = 0;
	for (let i = 0; i < BLOCK; i++)
		sum += i >= 148 && i < 156 ? 32 : (block[i] ?? 0);
	return sum;
}

/** Reads the regular files of a ustar archive, in archive order. */
export function readTar(archive: Uint8Array): SourceFile[] {
	if (archive.byteLength > MAX_ARCHIVE_BYTES)
		throw new TarError("archive too large");
	const files: SourceFile[] = [];
	const seen = new Set<string>();
	let pax: Record<string, string> = {};
	let offset = 0;
	while (offset + BLOCK <= archive.byteLength) {
		const header = archive.subarray(offset, offset + BLOCK);
		if (header.every((b) => b === 0)) return files;
		if (field(header, 257, 6) !== "ustar")
			throw new TarError("not a ustar archive");
		if (octal(header, 148, 8) !== checksum(header))
			throw new TarError("header checksum mismatch");
		const prefix = field(header, 345, 155);
		const name = field(header, 0, 100);
		const path = (pax.path ?? (prefix ? `${prefix}/${name}` : name))
			.replace(/^\.\//, "")
			.replace(/\/$/, "");
		const size =
			pax.size !== undefined ? Number(pax.size) : octal(header, 124, 12);
		if (!Number.isSafeInteger(size) || size < 0)
			throw new TarError("malformed size");
		const type = String.fromCharCode(header[156] ?? 0);
		offset += BLOCK;
		const padded = Math.ceil(size / BLOCK) * BLOCK;
		if (offset + padded > archive.byteLength)
			throw new TarError("truncated entry");
		if (type === "x" || type === "g") {
			// PAX extended header (node-tar's portable mode writes one for a long
			// path): only `path` and `size` of an `x` header matter here.
			const records =
				type === "x" ? paxRecords(archive.subarray(offset, offset + size)) : {};
			offset += padded;
			pax = records;
			continue;
		}
		pax = {};
		if (type === "5") {
			if (size !== 0) throw new TarError("directory with content");
		} else if (type === "0" || type === "\0") {
			if (!isSourcePath(path))
				throw new TarError(`refused path ${JSON.stringify(path)}`);
			if (seen.has(path)) throw new TarError(`duplicate path ${path}`);
			seen.add(path);
			if (files.length >= MAX_FILES) throw new TarError("too many files");
			files.push({ path, bytes: archive.slice(offset, offset + size) });
		} else {
			throw new TarError(`refused entry type ${JSON.stringify(type)}`);
		}
		offset += padded;
	}
	throw new TarError("missing end-of-archive marker");
}

function paxRecords(body: Uint8Array): Record<string, string> {
	const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
	const out: Record<string, string> = {};
	let at = 0;
	while (at < text.length) {
		const space = text.indexOf(" ", at);
		const length = Number(text.slice(at, space));
		if (space < 0 || !Number.isSafeInteger(length) || length <= 0)
			throw new TarError("malformed PAX record");
		const record = text.slice(space + 1, at + length - 1);
		const eq = record.indexOf("=");
		if (eq <= 0) throw new TarError("malformed PAX record");
		const key = record.slice(0, eq);
		if (key === "path" || key === "size") out[key] = record.slice(eq + 1);
		at += length;
	}
	return out;
}

function put(
	block: Uint8Array,
	offset: number,
	length: number,
	text: string,
): void {
	const bytes = new TextEncoder().encode(text);
	if (bytes.byteLength > length) throw new TarError("field overflow");
	block.set(bytes, offset);
}

function putOctal(
	block: Uint8Array,
	offset: number,
	length: number,
	value: number,
): void {
	put(
		block,
		offset,
		length,
		`${value.toString(8).padStart(length - 1, "0")}\0`,
	);
}

function splitPath(path: string): [string, string] {
	if (new TextEncoder().encode(path).byteLength <= 100) return ["", path];
	for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
		const prefix = path.slice(0, i);
		const name = path.slice(i + 1);
		if (
			new TextEncoder().encode(prefix).byteLength <= 155 &&
			new TextEncoder().encode(name).byteLength <= 100
		) {
			return [prefix, name];
		}
	}
	throw new TarError(`path too long for ustar: ${path}`);
}

/** Writes regular files as a deterministic ustar archive (sorted paths). */
export function writeTar(files: readonly SourceFile[]): Uint8Array {
	if (files.length > MAX_FILES) throw new TarError("too many files");
	const sorted = [...files].sort((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);
	const chunks: Uint8Array[] = [];
	let total = 0;
	let previous = "";
	for (const file of sorted) {
		if (!isSourcePath(file.path))
			throw new TarError(`refused path ${JSON.stringify(file.path)}`);
		if (file.path === previous)
			throw new TarError(`duplicate path ${file.path}`);
		previous = file.path;
		const header = new Uint8Array(BLOCK);
		const [prefix, name] = splitPath(file.path);
		put(header, 0, 100, name);
		putOctal(header, 100, 8, 0o644);
		putOctal(header, 108, 8, 0);
		putOctal(header, 116, 8, 0);
		putOctal(header, 124, 12, file.bytes.byteLength);
		putOctal(header, 136, 12, 0);
		header[156] = "0".charCodeAt(0);
		put(header, 257, 6, "ustar\0");
		put(header, 263, 2, "00");
		put(header, 345, 155, prefix);
		put(header, 148, 8, `${checksum(header).toString(8).padStart(6, "0")}\0 `);
		const body = new Uint8Array(
			Math.ceil(file.bytes.byteLength / BLOCK) * BLOCK,
		);
		body.set(file.bytes);
		chunks.push(header, body);
		total += BLOCK + body.byteLength;
		if (total > MAX_ARCHIVE_BYTES) throw new TarError("archive too large");
	}
	chunks.push(new Uint8Array(2 * BLOCK));
	total += 2 * BLOCK;
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.byteLength;
	}
	return out;
}
