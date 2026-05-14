"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "anvilkit:demo:peer";

// Stable defaults used on the server pass and on the first client render
// before we read localStorage. `id` is a fixed sentinel so two different
// browsers don't collide before they each generate their own UUIDs.
const PLACEHOLDER_ID = "demo-guest";
const PLACEHOLDER_NAME = "Guest";

export interface DemoIdentity {
	readonly id: string;
	readonly displayName: string;
	readonly color: string;
}

const ADJECTIVES = [
	"Curious",
	"Daring",
	"Eager",
	"Gentle",
	"Jolly",
	"Keen",
	"Lively",
	"Mighty",
	"Nimble",
	"Playful",
	"Quick",
	"Sunny",
	"Swift",
	"Witty",
	"Zesty",
	"Bright",
];

const ANIMALS = [
	"Falcon",
	"Otter",
	"Panda",
	"Lynx",
	"Heron",
	"Badger",
	"Marmot",
	"Puffin",
	"Quokka",
	"Raven",
	"Seal",
	"Tapir",
	"Vole",
	"Wombat",
	"Yak",
	"Zebra",
];

/**
 * Deterministic pastel from a stable id hash. Kept in sync with the
 * `peerColor` helper inside `collab-demo.ts` / `collab-relay-bundle.ts`
 * so an identity object produced here yields the same color the bundle
 * would compute internally — the bundle now reads from the identity
 * directly, but keeping the algorithm aligned avoids a silent drift if
 * an upstream change ever stops passing the color through.
 */
export function peerColor(seed: string): string {
	let hash = 0;
	for (const ch of seed) {
		hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	}
	const hue = ((hash % 360) + 360) % 360;
	return `hsl(${hue}, 70%, 55%)`;
}

function randomDisplayName(): string {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
	return `${adj} ${animal}`;
}

function generateId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `peer-${Math.random().toString(36).slice(2, 10)}`;
}

function readStored(): DemoIdentity | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<DemoIdentity>;
		if (
			typeof parsed.id === "string" &&
			typeof parsed.displayName === "string" &&
			typeof parsed.color === "string"
		) {
			return {
				id: parsed.id,
				displayName: parsed.displayName,
				color: parsed.color,
			};
		}
		return null;
	} catch {
		return null;
	}
}

function writeStored(identity: DemoIdentity): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
	} catch {
		// Storage may be blocked (private mode, quota); the in-memory
		// state still drives the session, so swallow.
	}
}

export interface UseDemoIdentityOptions {
	/**
	 * One-shot override for the display name (from `?peer=`). Does NOT
	 * persist to localStorage; lets two-tab manual testing pin distinct
	 * names without touching the user's saved identity.
	 */
	readonly peerOverride?: string | null;
}

export interface UseDemoIdentityResult {
	readonly identity: DemoIdentity;
	readonly setDisplayName: (next: string) => void;
}

/**
 * Persist a random adjective-animal identity in localStorage so a user
 * who refreshes the demo keeps the same handle (and color) across
 * sessions, without surfacing a sign-up form. SSR-safe: first render
 * is the static `{ id: "demo-guest", displayName: "Guest" }` placeholder
 * and we flip to the real identity inside a layout effect on the client.
 */
export function useDemoIdentity(
	options: UseDemoIdentityOptions = {},
): UseDemoIdentityResult {
	const [identity, setIdentity] = useState<DemoIdentity>({
		id: PLACEHOLDER_ID,
		displayName: options.peerOverride || PLACEHOLDER_NAME,
		color: peerColor(PLACEHOLDER_ID),
	});

	useEffect(() => {
		const stored = readStored();
		if (stored) {
			setIdentity({
				...stored,
				displayName: options.peerOverride || stored.displayName,
			});
			return;
		}
		const id = generateId();
		const displayName = options.peerOverride || randomDisplayName();
		const fresh: DemoIdentity = {
			id,
			displayName,
			color: peerColor(id),
		};
		// Only persist when there is no peer override; otherwise a tab
		// opened with `?peer=Bob` would clobber the user's saved name.
		if (!options.peerOverride) {
			writeStored(fresh);
		}
		setIdentity(fresh);
	}, [options.peerOverride]);

	const setDisplayName = useCallback((next: string) => {
		setIdentity((prev) => {
			const trimmed = next.trim().slice(0, 64) || prev.displayName;
			const updated: DemoIdentity = { ...prev, displayName: trimmed };
			writeStored(updated);
			return updated;
		});
	}, []);

	return { identity, setDisplayName };
}
